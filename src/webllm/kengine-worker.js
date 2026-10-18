// Worker de K.ENGINE: aquí vive WebLLM (dependencia npm empaquetada por Vite; sin CDN).
// Flujo: main → EngineProvider → ModelManager → este Worker → @mlc-ai/web-llm → WebGPU.
//
// Ciclo de vida de modelos:
//   CÓDIGO (modelRegistry) → DESCARGAR → Cache del navegador → FORMATEAR → solo código de nuevo.
import { prebuiltAppConfig, CreateMLCEngine } from "@mlc-ai/web-llm";
import { buildKernelAppConfig, KERNEL_MODEL_IDS } from "../engine/modelRegistry.js";

let engine = null;
let loadedModel = null;
let generating = false;
let loading = false;

// AppConfig KERNEL: solo los 4 modelos del registro + overrides de contexto.
const { appConfig: KERNEL_APP_CONFIG, missing: KERNEL_MISSING } = buildKernelAppConfig(prebuiltAppConfig);
if (KERNEL_MISSING.length) {
  console.warn("[K.ENGINE] Modelos del registro no encontrados en esta versión de WebLLM:", KERNEL_MISSING);
}

// ---------------------------------------------------------------------------
// Interceptores de Cache API (add + put) para WebLLM 0.2.79
// ---------------------------------------------------------------------------
const MAX_CACHE_RETRIES = 4;
const CACHE_BACKOFF_MS = [400, 1200, 3000, 6000];

function fmtBytes(n) {
  if (n == null || isNaN(n)) return "?";
  const MB = 1024 * 1024;
  return n >= 1024 * MB ? (n / (1024 * MB)).toFixed(2) + " GB" : (n / MB).toFixed(1) + " MB";
}

async function storageEstimate() {
  try {
    if (self.navigator?.storage?.estimate) {
      const e = await self.navigator.storage.estimate();
      return { usage: e.usage ?? null, quota: e.quota ?? null, line: `uso ≈ ${fmtBytes(e.usage)} de ${fmtBytes(e.quota)}` };
    }
  } catch (_) { /* ignore */ }
  return { usage: null, quota: null, line: "estimate() no disponible en este contexto" };
}

function getContentLength(response) {
  const cl = response?.headers?.get?.("content-length") ?? response?.headers?.get?.("Content-Length");
  if (cl == null || cl === "") return null;
  const n = Number(cl);
  return Number.isFinite(n) ? n : null;
}

function requestUrl(request) {
  return typeof request === "string" ? request : request?.url || String(request);
}

function isTransientStorageError(err) {
  const msg = String((err && err.message) || err || "").toLowerCase();
  return (
    msg.includes("unexpected internal error") ||
    msg.includes("quotaexceeded") ||
    msg.includes("quota exceeded") ||
    msg.includes("internal error") ||
    msg.includes("unknown error")
  );
}

function isTransientNetworkError(err) {
  const msg = String((err && err.message) || err || "").toLowerCase();
  const name = String((err && err.name) || "").toLowerCase();
  if (name === "aborterror") return false;
  return (
    msg.includes("network error") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("fetch failed") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    (name === "typeerror" && (msg.includes("network") || msg.includes("fetch")))
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithNetworkRetries(request, url) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_CACHE_RETRIES; attempt++) {
    try {
      const req =
        typeof request === "string"
          ? new Request(request)
          : new Request(request.url, {
              method: request.method || "GET",
              headers: request.headers,
              mode: request.mode,
              credentials: request.credentials,
              cache: "no-store",
              redirect: request.redirect,
              referrer: request.referrer,
              integrity: request.integrity,
              signal: request.signal,
            });

      self.postMessage({
        type: "cache_diag",
        phase: "CACHE_ADD_FETCH",
        url,
        attempt,
        maxAttempts: MAX_CACHE_RETRIES,
      });

      const response = await fetch(req);

      if (!response.ok && response.status !== 0) {
        const msg = `[K.ENGINE] Cache.add: HTTP ${response.status} definitivo. URL: ${url}`;
        self.postMessage({ type: "cache_diag", phase: "CACHE_ADD_HTTP_FAIL", url, status: response.status, message: msg });
        throw new Error(msg);
      }

      return response;
    } catch (err) {
      lastError = err;
      if (err && err.name === "AbortError") throw err;

      const transient = isTransientNetworkError(err);
      const msg =
        `[K.ENGINE] Cache.add fetch falló. URL: ${url}. Fase: CACHE_ADD_FETCH. ` +
        `Intentos: ${attempt}/${MAX_CACHE_RETRIES}. Error original: ${String((err && err.message) || err)}`;

      self.postMessage({
        type: "cache_diag",
        phase: "CACHE_ADD_FETCH_FAIL",
        url,
        attempt,
        maxAttempts: MAX_CACHE_RETRIES,
        transient,
        message: msg,
        error: String((err && err.message) || err),
      });

      if (!transient || attempt === MAX_CACHE_RETRIES) {
        throw new Error(msg);
      }
      await sleep(CACHE_BACKOFF_MS[Math.min(attempt - 1, CACHE_BACKOFF_MS.length - 1)]);
    }
  }
  throw lastError || new Error("[K.ENGINE] Cache.add fetch falló tras reintentos.");
}

function installCacheInterceptors() {
  if (self.__KENGINE_CACHE_INTERCEPTORS__) return;
  if (typeof Cache === "undefined" || !Cache.prototype) return;
  self.__KENGINE_CACHE_INTERCEPTORS__ = true;

  const originalPut = Cache.prototype.put;
  const originalAdd = Cache.prototype.add;
  const originalMatch = Cache.prototype.match;

  Cache.prototype.put = async function patchedPut(request, response) {
    const url = requestUrl(request);
    const contentLength = getContentLength(response);
    const est = await storageEstimate();

    self.postMessage({
      type: "cache_diag",
      phase: "CACHE_PUT_BEFORE",
      url,
      contentLength,
      contentLengthFmt: contentLength != null ? fmtBytes(contentLength) : null,
      storage: est,
    });

    if (response && !response.ok && response.status !== 0) {
      const msg = `[K.ENGINE] Cache.put rechazado: respuesta no OK (status=${response.status}). URL: ${url}`;
      self.postMessage({ type: "cache_diag", phase: "CACHE_PUT_REJECT", url, status: response.status, message: msg });
      throw new Error(msg);
    }

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_CACHE_RETRIES; attempt++) {
      try {
        const toStore = response && typeof response.clone === "function" ? response.clone() : response;
        await originalPut.call(this, request, toStore);

        self.postMessage({
          type: "cache_diag",
          phase: "CACHE_PUT_OK",
          url,
          attempt,
          contentLength,
          storage: est,
        });
        return;
      } catch (err) {
        lastError = err;
        const transient = isTransientStorageError(err);
        const msg =
          `[K.ENGINE] Cache.put falló (escritura). URL: ${url}. Fase: CACHE_PUT. ` +
          `Intentos: ${attempt}/${MAX_CACHE_RETRIES}. Error original: ${String((err && err.message) || err)}` +
          (contentLength != null ? ` · Content-Length: ${fmtBytes(contentLength)}` : "") +
          ` · ${est.line}`;

        self.postMessage({
          type: "cache_diag",
          phase: "CACHE_PUT",
          url,
          attempt,
          maxAttempts: MAX_CACHE_RETRIES,
          transient,
          contentLength,
          storage: est,
          message: msg,
          error: String((err && err.message) || err),
        });

        if (!transient || attempt === MAX_CACHE_RETRIES) {
          throw new Error(msg);
        }

        const delay = CACHE_BACKOFF_MS[Math.min(attempt - 1, CACHE_BACKOFF_MS.length - 1)];
        await sleep(delay);

        const est2 = await storageEstimate();
        self.postMessage({
          type: "cache_diag",
          phase: "CACHE_PUT_RETRY",
          url,
          attempt: attempt + 1,
          storage: est2,
          delayMs: delay,
        });
      }
    }
    throw lastError || new Error("[K.ENGINE] Cache.put falló tras reintentos.");
  };

  Cache.prototype.add = async function patchedAdd(request) {
    const url = requestUrl(request);
    const est = await storageEstimate();

    self.postMessage({
      type: "cache_diag",
      phase: "CACHE_ADD_BEFORE",
      url,
      storage: est,
    });

    try {
      const existing = await originalMatch.call(this, request);
      if (existing) {
        self.postMessage({ type: "cache_diag", phase: "CACHE_ADD_HIT", url });
        return;
      }
    } catch (_) {
      /* match falló: continuar con descarga */
    }

    const response = await fetchWithNetworkRetries(request, url);
    await this.put(request, response);

    self.postMessage({
      type: "cache_diag",
      phase: "CACHE_ADD_OK",
      url,
      contentLength: getContentLength(response),
      storage: await storageEstimate(),
    });
  };

  if (typeof Cache.prototype.addAll === "function") {
    Cache.prototype.addAll = async function patchedAddAll(requests) {
      const list = Array.from(requests || []);
      for (const req of list) {
        await this.add(req);
      }
    };
  }

  self.__KENGINE_ORIGINAL_CACHE_PUT__ = originalPut;
  self.__KENGINE_ORIGINAL_CACHE_ADD__ = originalAdd;
}

installCacheInterceptors();

const MODEL_LIST = KERNEL_APP_CONFIG.model_list;
const AVAILABLE_IDS = MODEL_LIST.map((m) => m.model_id);

/** Solo modelos del registro KERNEL (código). */
function getWebLLMModel(modelId) {
  const model = MODEL_LIST.find((item) => item.model_id === modelId) || null;
  if (!model) {
    throw new Error(
      "Modelo no está en el registro KERNEL: " +
        modelId +
        ". Disponibles en código: " +
        KERNEL_MODEL_IDS.join(", ") +
        " (resueltos en esta build: " +
        AVAILABLE_IDS.join(", ") +
        ").",
    );
  }
  return model;
}

function phaseOf(p) {
  const t = (p.text || "").toLowerCase();
  if (t.includes("fetching")) return "DOWNLOADING";
  if (t.includes("loading model from cache") || t.includes("loading gpu shader") || t.includes("finish loading")) return "LOADING";
  return p.progress >= 1 ? "LOADING" : "DOWNLOADING";
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      // DESCARGAR / CARGAR: definición en código → pesos al navegador
      let record;
      try {
        record = getWebLLMModel(msg.model);
      } catch (vErr) {
        self.postMessage({ type: "error", scope: "load", message: String(vErr.message || vErr) });
        return;
      }
      if (!self.navigator || !self.navigator.gpu) {
        self.postMessage({ type: "error", scope: "load", message: "WebGPU (navigator.gpu) no está disponible dentro del worker." });
        return;
      }
      if (loading) {
        self.postMessage({ type: "error", scope: "load", message: "Ya hay una carga en curso." });
        return;
      }
      if (generating) {
        self.postMessage({ type: "error", scope: "load", message: "Generación en curso; no se puede cargar otro modelo." });
        return;
      }
      if (engine && loadedModel === msg.model) {
        self.postMessage({ type: "ready", model: msg.model, cached: true });
        return;
      }
      loading = true;
      try {
        if (engine) {
          self.postMessage({ type: "status", value: "UNLOADING" });
          await engine.unload();
          engine = null;
          loadedModel = null;
        }
        self.postMessage({ type: "status", value: "DOWNLOADING" });
        try {
          engine = await CreateMLCEngine(record.model_id, {
            appConfig: KERNEL_APP_CONFIG,
            initProgressCallback: (p) => {
              self.postMessage({ type: "progress", progress: p.progress || 0, text: p.text || "", phase: phaseOf(p) });
            },
          });
        } catch (loadErr) {
          engine = null;
          self.postMessage({
            type: "error",
            scope: "load",
            message:
              "CreateMLCEngine falló para " + record.model_id + ".\nERROR ORIGINAL: " + String((loadErr && loadErr.message) || loadErr),
          });
          return;
        }
        loadedModel = msg.model;
        self.postMessage({ type: "status", value: "VERIFYING" });
        const t0 = performance.now();
        const out = await engine.chat.completions.create({
          messages: [{ role: "user", content: "Responde únicamente con la palabra: ok" }],
          max_tokens: 8,
          temperature: 0,
          stream: false,
        });
        const text = out.choices[0]?.message?.content || "";
        if (!text) throw new Error("La verificación de generación no devolvió texto.");
        self.postMessage({ type: "verified", model: msg.model, ms: Math.round(performance.now() - t0) });
      } finally {
        loading = false;
      }
    } else if (msg.type === "generate") {
      if (!engine || loadedModel !== msg.model) {
        self.postMessage({ type: "error", scope: "generate", message: "El modelo no está cargado." });
        return;
      }
      generating = true;
      self.postMessage({ type: "genstart", id: msg.id });
      const t0 = performance.now();
      let firstTokenMs = null;
      const chunks = await engine.chat.completions.create({
        messages: msg.messages,
        // Respecta el perfil definido por modelo en genConfig.js.
        temperature: Number.isFinite(Number(msg.temperature)) ? Number(msg.temperature) : 0.6,
        top_p: Number.isFinite(Number(msg.top_p)) ? Number(msg.top_p) : 0.9,
        max_tokens: Number.isFinite(Number(msg.max_tokens)) ? Math.max(1, Number(msg.max_tokens)) : 512,
        stream: true,
        stream_options: { include_usage: true },
      });
      for await (const chunk of chunks) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          if (firstTokenMs === null) firstTokenMs = Math.round(performance.now() - t0);
          self.postMessage({ type: "token", id: msg.id, delta });
        }
        if (chunk.usage) {
          self.postMessage({
            type: "usage",
            id: msg.id,
            completionTokens: chunk.usage.completion_tokens,
            genMs: Math.round(performance.now() - t0),
            firstTokenMs,
            tps:
              chunk.usage.completion_tokens && chunk.choices[0]?.finish_reason
                ? +(chunk.usage.completion_tokens / ((performance.now() - t0) / 1000)).toFixed(1)
                : null,
          });
        }
      }
      generating = false;
      self.postMessage({ type: "gendone", id: msg.id });
    } else if (msg.type === "diagnose") {
      const rec = getWebLLMModel(msg.model);
      const base = rec.model.replace(/\/+$/, "") + "/resolve/main/";
      const probe = async (url) => {
        try {
          const r = await fetch(url, { headers: { Range: "bytes=0-0" } });
          return { url, ok: r.ok, status: r.status, redirected: r.redirected, finalUrl: r.redirected ? r.url : undefined, type: r.type };
        } catch (e) {
          return { url, ok: false, error: String((e && e.message) || e) };
        }
      };
      const post = (item) => self.postMessage({ type: "diag", item });
      post(await probe(rec.model_lib));
      for (const f of ["mlc-chat-config.json", "tokenizer.json"]) post(await probe(base + f));
      let cacheJson = null;
      try {
        const r = await fetch(base + "ndarray-cache.json");
        post({ url: base + "ndarray-cache.json", ok: r.ok, status: r.status, type: r.type });
        if (r.ok) cacheJson = await r.json();
      } catch (e) {
        post({ url: base + "ndarray-cache.json", ok: false, error: String((e && e.message) || e) });
      }
      if (cacheJson && Array.isArray(cacheJson.records)) for (const rc of cacheJson.records) post(await probe(base + rc.dataPath));
      const last = (performance.getEntriesByType("resource") || [])
        .slice(-8)
        .map((e) => ({ name: e.name, status: e.responseStatus ?? null, transferSize: e.transferSize, ms: Math.round(e.duration) }));
      self.postMessage({ type: "diag_done", model: rec.model_id, lastResources: last });
    } else if (msg.type === "cancel") {
      if (engine) engine.interruptGenerate();
    } else if (msg.type === "unload") {
      // Liberar GPU/RAM; los pesos pueden seguir en Cache Storage del navegador.
      if (generating) {
        self.postMessage({ type: "error", scope: "unload", message: "No se puede descargar de memoria durante la generación." });
        return;
      }
      if (engine) {
        self.postMessage({ type: "status", value: "UNLOADING" });
        await engine.unload();
        engine = null;
        loadedModel = null;
        self.postMessage({ type: "unloaded" });
      }
    }
  } catch (err) {
    generating = false;
    const message = String((err && err.message) || err);
    console.error("[WebLLM] Error del worker:", err);
    self.postMessage({ type: "error", scope: msg.type || "unknown", message });
  }
};
