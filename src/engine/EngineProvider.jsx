import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { KERNEL_PERSONALITY } from "./personality";
import { modelManager, IN_MEMORY } from "./modelManager";
import { detectHardware, emptyHardware, CLASS } from "./hardware";
import { getSetting, setSetting, loadChat, saveChat, clearChat } from "./storage";
import { api, probeApi, tokenGet, tokenSet } from "../api/client";
import { scanCaches, cacheApiSelfTest, classify as classifyDiag, formatCacheSummary, storageEstimateLine, fmtBytes } from "../api/cache";

const KERNEL_ALLOWED_ORIGINS = [
  "https://project-kernel-release-1-0-0.lovable.app",
  "https://project-kernel-release-1-0-0.vercel.app",
  "https://project-kernel-release-0-6-0.lovable.app",
  "https://project-kernel-release-0-5-0.lovable.app",
];
function postToKernelOpener(opener, payload) {
  if (!opener || opener.closed) return;
  for (const origin of KERNEL_ALLOWED_ORIGINS) {
    try { opener.postMessage(payload, origin); } catch {}
  }
}

const EngineContext = createContext(null);
export function useEngine() {
  const v = useContext(EngineContext);
  if (!v) throw new Error("useEngine debe usarse dentro de EngineProvider");
  return v;
}

const emptyMetrics = () => ({ tokens: "N/A", tps: "N/A", genTime: "N/A", firstTok: "N/A" });

const emptyControl = () => ({
  cacheSummary: "Sin escanear.",
  diagOut: "",
  cfgBackend: "auto",
  cfgBaseUrl: "",
  cfgApiKey: "",
  cfgModel: "",
  cfgToken: "",
  cfgKeyState: "",
  cfgMsg: "",
  cfgDisabled: false,
  ksBridge: "—",
});

export function parseKernelUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return { ok: false, error: "Introduce una URL." };
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: "Solo se admiten URLs http:// o https://." };
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, error: "URL no válida (ejemplo de formato: https://host/ruta)." };
  }
}

export function EngineProvider({ children }) {
  const mm = useSyncExternalStore(modelManager.subscribe, modelManager.getSnapshot);

  const [startPhase, setStartPhase] = useState("IDLE");
  const [startError, setStartError] = useState(null);
  const [hardware, setHardware] = useState(emptyHardware);
  const [manualVram, setManualVramState] = useState(null);
  const [kernelUrl, setKernelUrlState] = useState("");
  const [kernelUrlError, setKernelUrlError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [labError, setLabError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [control, setControl] = useState(emptyControl);
  const [apiState, setApiState] = useState({ ok: false, version: null });

  const keRef = useRef({ apiOk: false, cid: null, lastReported: "", job: null, diag: [], labGenId: null, started: false, bridgeRequestId: null });
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const mmRef = useRef(mm);
  mmRef.current = mm;

  const patchControl = useCallback((partial) => setControl((prev) => ({ ...prev, ...partial })), []);

  useEffect(() => {
    let off = false;
    (async () => {
      const [url, vram, sel] = await Promise.all([getSetting("kernelUrl", ""), getSetting("vramGB", null), getSetting("selectedModel", null)]);
      if (off) return;
      setKernelUrlState(url || "");
      setManualVramState(vram);
      await modelManager.init();
      if (sel) modelManager.select(sel);
    })();
    return () => { off = true; };
  }, []);

  useEffect(() => {
    modelManager.setManual({ vramGB: manualVram || null });
  }, [manualVram]);

  const setManualVram = useCallback((gb) => {
    const n = gb === "" || gb == null ? null : Math.max(0.5, Math.min(256, Number(gb)));
    const v = Number.isFinite(n) ? n : null;
    setManualVramState(v);
    setSetting("vramGB", v);
  }, []);

  const saveKernelUrl = useCallback((raw) => {
    const r = parseKernelUrl(raw);
    if (!r.ok) { setKernelUrlError(r.error); return false; }
    setKernelUrlError(null);
    setKernelUrlState(r.url);
    setSetting("kernelUrl", r.url);
    return true;
  }, []);
  const clearKernelUrl = useCallback(() => {
    setKernelUrlState("");
    setSetting("kernelUrl", "");
  }, []);

  const loadedId = mm.loadedId;
  const loadedStatus = loadedId ? mm.models[loadedId]?.status : null;

  useEffect(() => {
    let off = false;
    setGenerating(false);
    if (!loadedId) return undefined;
    loadChat(loadedId).then((m) => !off && setMessages(Array.isArray(m) ? m : []));
    return () => { off = true; };
  }, [loadedId]);

  useEffect(
    () =>
      modelManager.onMessage((d) => {
        const KE = keRef.current;
        if (d.type === "genstart" && d.id === KE.labGenId) setGenerating(true);
        else if (d.type === "token" && d.id === KE.labGenId) {
          setMessages((prev) => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.streaming) next[next.length - 1] = { ...last, content: last.content + d.delta };
            else next.push({ role: "assistant", content: d.delta, streaming: true });
            return next;
          });
        } else if (d.type === "usage" && d.id === KE.labGenId) {
          setMetrics((m) => ({
            tokens: d.completionTokens != null ? String(d.completionTokens) : m.tokens,
            genTime: d.genMs != null ? (d.genMs / 1000).toFixed(1) + " s" : m.genTime,
            firstTok: d.firstTokenMs != null ? d.firstTokenMs + " ms" : m.firstTok,
            tps: d.tps != null ? String(d.tps) : m.tps,
          }));
        } else if (d.type === "gendone" && d.id === KE.labGenId) {
          setGenerating(false);
          KE.labGenId = null;
          setMessages((prev) => {
            const next = prev.map((m) => (m.streaming ? { role: m.role, content: m.content } : m));
            if (mmRef.current.loadedId) saveChat(mmRef.current.loadedId, next);
            const requestId = KE.bridgeRequestId;
            if (requestId) {
              KE.bridgeRequestId = null;
              const answer = [...next].reverse().find((m) => m.role === "assistant")?.content || "";
              try {
                if (window.opener && !window.opener.closed) {
                  postToKernelOpener(window.opener, { type: "KENGINE_RESPONSE", requestId, response: answer });
                }
              } catch {}
            }
            return next;
          });
        } else if (d.type === "error" && d.scope === "generate") {
          setGenerating(false);
          KE.labGenId = null;
          setLabError("Fallo en la generación: " + d.message);
          setMessages((prev) => prev.map((m) => (m.streaming ? { role: m.role, content: m.content } : m)));
          const requestId = KE.bridgeRequestId;
          if (requestId) {
            KE.bridgeRequestId = null;
            try {
              if (window.opener && !window.opener.closed) {
                postToKernelOpener(window.opener, { type: "KENGINE_ERROR", requestId, error: String(d.message || "Fallo"), code: "generation_failed" });
              }
            } catch {}
          }
        }
      }),
    [],
  );

  const sendChat = useCallback((text) => {
    const trimmed = text.trim();
    const m = mmRef.current;
    const id = m.loadedId;
    if (!trimmed || !id || m.models[id]?.status !== "READY" || keRef.current.job) return false;
    const history = [...messagesRef.current, { role: "user", content: trimmed }];
    setMessages(history);
    setLabError(null);
    const genId = Date.now();
    keRef.current.labGenId = genId;
    const payload = [{ role: "system", content: KERNEL_PERSONALITY.systemPrompt }, ...history.slice(-12).map(({ role, content }) => ({ role, content }))];
    modelManager.generate({ id: genId, model: id, messages: payload });
    return true;
  }, []);

  useEffect(() => {
    const opener = window.opener;
    if (!opener) return undefined;
    const announce = () => {
      try {
        if (!opener.closed) {
          postToKernelOpener(opener, {
            type: "KENGINE_BRIDGE_READY",
            modelReady: Boolean(mmRef.current.loadedId) && mmRef.current.models[mmRef.current.loadedId]?.status === "READY",
            model: mmRef.current.loadedId || null,
          });
        }
      } catch {}
    };
    const onMessage = (event) => {
      if (!KERNEL_ALLOWED_ORIGINS.includes(event.origin) || event.source !== window.opener) return;
      const data = event.data;
      if (!data || data.type !== "KERNEL_REQUEST") return;
      const requestId = typeof data.requestId === "string" ? data.requestId.slice(0, 120) : "";
      const prompt = typeof data.message === "string" ? data.message.trim() : "";
      const replyError = (error, code) => {
        try { postToKernelOpener(window.opener, { type: "KENGINE_ERROR", requestId, error, code }); } catch {}
      };
      if (!requestId || !prompt || prompt.length > 8000) {
        replyError("Solicitud vacía o demasiado larga.", "invalid_request");
        return;
      }
      const current = mmRef.current;
      const modelId = current.loadedId;
      const status = modelId ? current.models[modelId]?.status : null;
      if (status !== "READY") {
        replyError("Modelo no listo. INICIAR MOTOR y carga un modelo hasta READY.", "model_not_ready");
        return;
      }
      if (keRef.current.bridgeRequestId || keRef.current.labGenId || keRef.current.job || generating) {
        replyError("K.ENGINE ocupado.", "busy");
        return;
      }
      keRef.current.bridgeRequestId = requestId;
      if (!sendChat(prompt)) {
        keRef.current.bridgeRequestId = null;
        replyError("No se pudo iniciar inferencia.", "generation_not_started");
      }
    };
    window.addEventListener("message", onMessage);
    announce();
    return () => window.removeEventListener("message", onMessage);
  }, [loadedId, loadedStatus, generating, sendChat]);

  const cancelGenerate = useCallback(() => modelManager.cancelGenerate(), []);
  const resetChat = useCallback(() => {
    setMessages([]);
    setLabError(null);
    if (mmRef.current.loadedId) clearChat(mmRef.current.loadedId);
  }, []);

  const selectModel = useCallback((id) => {
    modelManager.select(id);
    setSetting("selectedModel", id);
  }, []);
  const download = useCallback((id) => modelManager.download(id), []);
  const unload = useCallback(() => modelManager.unload(), []);
  const cancelDownload = useCallback(() => modelManager.cancel(), []);
  const [formatResult, setFormatResult] = useState(null);
  const deleteModel = useCallback(async (id) => {
    const r = await modelManager.deleteModel(id);
    setFormatResult({ id, ...r });
    return r;
  }, []);

  const startEngine = useCallback(async () => {
    if (keRef.current.started) return;
    setStartPhase("STARTING");
    setStartError(null);
    try {
      const hw = await detectHardware();
      setHardware(hw);
      modelManager.setHardware(hw, { vramGB: manualVram || null });
      await modelManager.init();
      await Promise.all(modelManager.getSnapshot().catalog.featured.map((m) => modelManager.refreshCache(m.id)));
      keRef.current.started = true;
      setStartPhase("RUNNING");
    } catch (e) {
      setStartError("No se pudo iniciar el motor: " + ((e && e.message) || e));
      setStartPhase("FAILED");
    }
  }, [manualVram]);

  const loadConfig = useCallback(async () => {
    if (!keRef.current.apiOk) {
      patchControl({ cfgMsg: "Sin API local (npm start).", cfgDisabled: true });
      return;
    }
    patchControl({ cfgToken: tokenGet(), cfgDisabled: false });
    try {
      const c = await api("/config");
      patchControl({
        cfgBackend: c.backend,
        cfgBaseUrl: c.base_url,
        cfgModel: c.model,
        cfgKeyState: c.api_key_set ? "(guardada: " + c.api_key + ")" : "(sin definir)",
        cfgMsg: "Entorno: " + c.env,
      });
    } catch (e) {
      patchControl({ cfgMsg: "Error: " + e.message });
    }
  }, [patchControl]);

  useEffect(() => {
    let off = false;
    (async () => {
      const probe = await probeApi();
      if (off) return;
      keRef.current.apiOk = probe.ok;
      setApiState(probe);
      await loadConfig();
    })();
    return () => { off = true; };
  }, [loadConfig]);

  const saveConfig = useCallback(async () => {
    const c = control;
    tokenSet(c.cfgToken.trim());
    const body = { backend: c.cfgBackend, base_url: c.cfgBaseUrl.trim(), model: c.cfgModel.trim() };
    if (c.cfgApiKey) body.api_key = c.cfgApiKey;
    try {
      const saved = await api("/config", { method: "POST", body: JSON.stringify(body) });
      patchControl({ cfgApiKey: "", cfgKeyState: saved.api_key_set ? "(guardada)" : "(sin definir)", cfgMsg: "Guardado." });
    } catch (e) {
      patchControl({ cfgMsg: "No se pudo guardar: " + e.message });
    }
  }, [control, patchControl]);

  const testConfig = useCallback(async () => {
    try {
      const m = await api("/models");
      const o = m.models.find((x) => x.backend === "openai-compatible");
      patchControl({ cfgMsg: o ? "Proveedor: " + o.id : "OpenAI-compatible sin configurar." });
    } catch (e) {
      patchControl({ cfgMsg: "Error: " + e.message });
    }
  }, [patchControl]);

  const refreshCache = useCallback(async (id) => {
    await modelManager.refreshCache(id);
  }, []);

  const runDiagnosis = useCallback(async () => {
    try {
      const s = await scanCaches();
      const self = await cacheApiSelfTest();
      patchControl({ cacheSummary: formatCacheSummary(s), diagOut: classifyDiag(s, self) });
    } catch (e) {
      patchControl({ diagOut: String(e && e.message || e) });
    }
  }, [patchControl]);

  const statusLines = useMemo(() => {
    const lines = ["Fase: " + startPhase];
    if (startError) lines.push("Error: " + startError);
    lines.push("API: " + (apiState.ok ? "ok" : "no"));
    if (loadedId) lines.push("Modelo: " + loadedId + " · " + (loadedStatus || "?"));
    return lines;
  }, [startPhase, startError, apiState.ok, loadedId, loadedStatus]);

  const cls = useCallback((id) => mmRef.current && modelManager.classify(id), []);
  const classes = useMemo(() => {
    const out = {};
    for (const m of mm.catalog.models.length ? mm.catalog.featured : []) out[m.id] = modelManager.classify(m.id);
    const sel = mm.selectedId;
    if (sel && !out[sel]) out[sel] = modelManager.classify(sel);
    return out;
  }, [mm.catalog, mm.selectedId, hardware, manualVram]);

  const value = useMemo(
    () => ({
      ready: mm.ready,
      initError: mm.initError,
      catalog: mm.catalog,
      models: mm.models,
      selectedId: mm.selectedId,
      loadedId,
      opKind: mm.opKind,
      opId: mm.opId,
      classes,
      classify: cls,
      selectModel,
      download,
      retry: download,
      cancelDownload,
      unload,
      deleteModel,
      formatResult,
      startPhase,
      startError,
      startEngine,
      hardware,
      manualVram,
      setManualVram,
      kernelUrl,
      kernelUrlError,
      saveKernelUrl,
      clearKernelUrl,
      messages,
      sendChat,
      cancelGenerate,
      resetChat,
      labError,
      generating,
      metrics,
      chatReady: Boolean(loadedId) && mm.models[loadedId]?.status === "READY" && !generating,
      inMemory: Boolean(loadedId) && IN_MEMORY.includes(mm.models[loadedId]?.status),
      control,
      patchControl,
      saveConfig,
      testConfig,
      refreshCache,
      runDiagnosis,
      statusLines,
      CLASS,
    }),
    [mm, loadedId, classes, cls, selectModel, download, cancelDownload, unload, deleteModel, formatResult, startPhase, startError, startEngine, hardware, manualVram, setManualVram, kernelUrl, kernelUrlError, saveKernelUrl, clearKernelUrl, messages, sendChat, cancelGenerate, resetChat, labError, generating, metrics, control, patchControl, saveConfig, testConfig, refreshCache, runDiagnosis, statusLines],
  );

  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}
