/**
 * K.ENGINE API para Vercel Serverless.
 * Expone el mismo contrato HTTP que server.js (health/models/chat/config).
 *
 * Nota: el bridge WebLLM (SSE persistente + pestaña del navegador) necesita un
 * proceso Node de larga duración. En Vercel serverless NO hay pestaña unida al
 * servidor: /chat con backend webllm responde 503 explicativo.
 * Configura KENGINE_BASE_URL + KENGINE_MODEL para openai-compatible, o usa
 * `node server.js` en un host persistente para el bridge completo.
 */

const VERSION = "1.3.0";

const WEBLLM_MODELS = [
  { id: "llama-3.2-1b", webllm_id: "Llama-3.2-1B-Instruct-q4f16_1-MLC" },
  { id: "qwen2.5-0.5b", webllm_id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" },
  { id: "qwen2.5-1.5b", webllm_id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" },
  { id: "llama-3.2-3b", webllm_id: "Llama-3.2-3B-Instruct-q4f16_1-MLC" },
];

const SYSTEM_PROMPT =
  "Eres KERNEL, asistente técnico en español de España. Sé directo, preciso y sin relleno.";

function env(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

function cfg() {
  const baseUrl = env("KENGINE_BASE_URL").replace(/\/+$/, "");
  const model = env("KENGINE_MODEL");
  const apiKey = env("KENGINE_API_KEY");
  const authToken = env("KENGINE_AUTH_TOKEN");
  const defaultBackend = env("KENGINE_BACKEND", "auto");
  const maxTokens = Number(env("KENGINE_MAX_TOKENS", "1024")) || 1024;
  const timeoutMs = Number(env("KENGINE_TIMEOUT_MS", "120000")) || 120000;
  const cors = env("KENGINE_CORS_ORIGIN", "*");
  return { baseUrl, model, apiKey, authToken, defaultBackend, maxTokens, timeoutMs, cors };
}

function corsHeaders(req, c) {
  const origin = req.headers.origin || req.headers.Origin || "";
  const allowed = c.cors === "*" || !c.cors || c.cors.split(",").map((s) => s.trim()).includes(origin);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Cache-Control": "no-store",
  };
  if (c.cors === "*") {
    h["Access-Control-Allow-Origin"] = origin || "*";
    if (origin) h["Vary"] = "Origin";
  } else if (allowed && origin) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  }
  return h;
}

function send(res, req, c, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(req, c),
  });
  res.end(body);
}

function authorized(req, c) {
  if (!c.authToken) return true;
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return got === c.authToken;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (ch) => {
      n += ch.length;
      if (n > 512_000) {
        reject(Object.assign(new Error("Cuerpo demasiado grande"), { status: 413, code: "body_too_large" }));
        return;
      }
      chunks.push(ch);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object" || Array.isArray(j)) {
      throw Object.assign(new Error("El cuerpo debe ser un objeto JSON"), { status: 400, code: "invalid_body" });
    }
    return j;
  } catch (e) {
    if (e.status) throw e;
    throw Object.assign(new Error("JSON inválido"), { status: 400, code: "invalid_json" });
  }
}

function maskKey(k) {
  if (!k) return "";
  return k.length > 8 ? k.slice(0, 3) + "…" + k.slice(-4) : "••••";
}

function openaiConfigured(c) {
  return Boolean(c.baseUrl && c.model);
}

async function listRemoteModels(c) {
  const h = { "Content-Type": "application/json" };
  if (c.apiKey) h.Authorization = "Bearer " + c.apiKey;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Math.min(c.timeoutMs, 15000));
  try {
    const r = await fetch(c.baseUrl + "/models", { headers: h, signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    return (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean);
  } finally {
    clearTimeout(t);
  }
}

async function openaiComplete(c, messages) {
  const h = { "Content-Type": "application/json" };
  if (c.apiKey) h.Authorization = "Bearer " + c.apiKey;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), c.timeoutMs);
  try {
    const r = await fetch(c.baseUrl + "/chat/completions", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ model: c.model, messages, stream: false, max_tokens: c.maxTokens }),
      signal: ctl.signal,
    });
    const text = await r.text();
    if (!r.ok) throw new Error("El proveedor respondió HTTP " + r.status + ": " + text.slice(0, 300));
    const j = JSON.parse(text);
    const content = j?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Respuesta del proveedor sin content");
    return content;
  } finally {
    clearTimeout(t);
  }
}

async function handleModels(req, res, c) {
  const models = WEBLLM_MODELS.map((m) => ({
    id: m.id,
    backend: "webllm",
    webllm_id: m.webllm_id,
    status: "no_browser_connected",
    note: "En Vercel serverless no hay bridge a una pestaña; carga el modelo en la UI o usa openai-compatible.",
  }));
  const backends = {
    webllm: { browser_connected: false, loaded_model: null, bridge: "unavailable_on_vercel_serverless" },
    "openai-compatible": { configured: openaiConfigured(c) },
  };
  if (openaiConfigured(c)) {
    let check = "unreachable";
    let error;
    try {
      const ids = await listRemoteModels(c);
      check = ids.includes(c.model) ? "listed" : "not_listed";
    } catch (e) {
      error = e.message;
    }
    models.unshift({
      id: c.model,
      backend: "openai-compatible",
      status: "configured",
      provider_check: check,
    });
    backends["openai-compatible"].base_url = c.baseUrl;
    if (error) backends["openai-compatible"].error = error;
  }
  send(res, req, c, 200, { models, backends, engine: "K.ENGINE", version: VERSION });
}

async function handleChat(req, res, c) {
  const body = await readJson(req);
  if (typeof body.message !== "string" || !body.message.trim()) {
    return send(res, req, c, 400, { error: "'message' debe ser un texto no vacío", code: "invalid_message" });
  }
  const message = body.message.trim();
  const want = body.backend || c.defaultBackend || "auto";
  let backend = want;
  if (want === "auto") {
    backend = openaiConfigured(c) ? "openai-compatible" : "webllm";
  }
  if (backend === "webllm") {
    return send(res, req, c, 503, {
      error:
        "Backend webllm no disponible en este despliegue de Vercel: el modelo corre en el navegador y el bridge SSE requiere un proceso Node persistente (npm start / host con server.js). Configura KENGINE_BASE_URL y KENGINE_MODEL para openai-compatible, o despliega server.js en un host con bridge.",
      code: "no_backend",
      hint: "UI pública en esta misma URL: abre K.ENGINE, INICIAR MOTOR y carga un modelo para uso local en el navegador.",
    });
  }
  if (!openaiConfigured(c)) {
    return send(res, req, c, 503, {
      error: "Backend openai-compatible sin configurar: define KENGINE_BASE_URL y KENGINE_MODEL en Vercel.",
      code: "backend_not_configured",
    });
  }
  const history = Array.isArray(body.context) ? body.context : [];
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-40)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 8000) })),
    { role: "user", content: message.slice(0, 8000) },
  ];
  const text = await openaiComplete(c, messages);
  const conversation_id = typeof body.conversation_id === "string" ? body.conversation_id : cryptoRandom();
  send(res, req, c, 200, {
    response: text,
    model: c.model,
    backend: "openai-compatible",
    conversation_id,
    context: { used_messages: messages.length - 1, dropped_messages: 0 },
  });
}

function cryptoRandom() {
  return "k" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function handleConfigGet(req, res, c) {
  send(res, req, c, 200, {
    backend: c.defaultBackend || "auto",
    base_url: c.baseUrl,
    api_key: maskKey(c.apiKey),
    api_key_set: Boolean(c.apiKey),
    model: c.model,
    auth_required: Boolean(c.authToken),
    env: env("KENGINE_ENV", "production") || "production",
    persisted: false,
    platform: "vercel-serverless",
    bridge: "unavailable_on_vercel_serverless",
  });
}

function pathOf(req) {
  const u = new URL(req.url || "/", "http://localhost");
  return u.pathname.replace(/\/+$/, "") || "/";
}

export default async function handler(req, res) {
  const c = cfg();
  const method = req.method || "GET";
  const path = pathOf(req);

  if (method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req, c));
    return res.end();
  }

  try {
    if (method === "GET" && (path === "/health" || path === "/api/health")) {
      return send(res, req, c, 200, { status: "ok", engine: "K.ENGINE", version: VERSION, platform: "vercel-serverless" });
    }

    const protectedPaths = ["/models", "/api/models", "/chat", "/api/chat", "/config", "/api/config", "/bridge", "/api/bridge"];
    const needsAuth = protectedPaths.some((p) => path === p || path.startsWith(p + "/"));
    if (needsAuth && !authorized(req, c)) {
      return send(res, req, c, 401, { error: "No autorizado", code: "unauthorized" });
    }

    if (method === "GET" && (path === "/models" || path === "/api/models")) {
      return await handleModels(req, res, c);
    }
    if (method === "POST" && (path === "/chat" || path === "/api/chat")) {
      return await handleChat(req, res, c);
    }
    if (method === "GET" && (path === "/config" || path === "/api/config")) {
      return handleConfigGet(req, res, c);
    }
    if (path.startsWith("/bridge") || path.startsWith("/api/bridge")) {
      return send(res, req, c, 503, {
        error:
          "Bridge WebLLM no disponible en Vercel serverless (requiere SSE persistente + pestaña K.ENGINE). Usa server.js en un host Node o openai-compatible.",
        code: "bridge_unavailable",
      });
    }
    if (method === "POST" && (path === "/config" || path === "/api/config")) {
      return send(res, req, c, 403, {
        error: "POST /config no persiste en Vercel serverless; usa variables de entorno del proyecto.",
        code: "forbidden",
      });
    }

    return send(res, req, c, 404, { error: "No encontrado", code: "not_found" });
  } catch (e) {
    const code = e.status || 502;
    return send(res, req, c, code, { error: e.message || String(e), code: e.code || "error" });
  }
}
