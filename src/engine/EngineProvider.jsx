import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { KERNEL_PERSONALITY } from "./personality";
import {
  isAllowedKernelOrigin,
  resolveKernelReplyOrigin,
  postToKernel,
} from "./kernelBridge";
import { modelManager, IN_MEMORY } from "./modelManager";
import { detectHardware, emptyHardware, CLASS } from "./hardware";
import { getSetting, setSetting, loadChat, saveChat, clearChat } from "./storage";
import { api, probeApi, tokenGet, tokenSet } from "../api/client";
import { scanCaches, cacheApiSelfTest, classify as classifyDiag, formatCacheSummary, storageEstimateLine, fmtBytes } from "../api/cache";

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

/** Valida la URL de la interfaz KERNEL. No se inventa ninguna ni se conecta sola. */
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

  // Arranque del motor (botón INICIAR MOTOR)
  const [startPhase, setStartPhase] = useState("IDLE"); // IDLE · STARTING · RUNNING · FAILED
  const [startError, setStartError] = useState(null);
  const [hardware, setHardware] = useState(emptyHardware);
  const [manualVram, setManualVramState] = useState(null);
  const [kernelUrl, setKernelUrlState] = useState("");
  const [kernelUrlError, setKernelUrlError] = useState(null);

  // Laboratorio
  const [messages, setMessages] = useState([]);
  const [labError, setLabError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [metrics, setMetrics] = useState(emptyMetrics);

  // Backend HTTP / diagnóstico
  const [control, setControl] = useState(emptyControl);
  const [apiState, setApiState] = useState({ ok: false, version: null });

  const keRef = useRef({ apiOk: false, cid: null, lastReported: "", job: null, diag: [], labGenId: null, started: false, bridgeRequestId: null, bridgeReplyOrigin: null });
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const mmRef = useRef(mm);
  mmRef.current = mm;

  const patchControl = useCallback((partial) => setControl((prev) => ({ ...prev, ...partial })), []);

  /* ---------- ajustes persistidos (IndexedDB) + catálogo ---------- */
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
    return () => {
      off = true;
    };
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
    if (!r.ok) {
      setKernelUrlError(r.error);
      return false;
    }
    setKernelUrlError(null);
    setKernelUrlState(r.url);
    setSetting("kernelUrl", r.url);
    return true;
  }, []);
  const clearKernelUrl = useCallback(() => {
    setKernelUrlState("");
    setSetting("kernelUrl", "");
  }, []);

  /* ---------- chat del laboratorio ---------- */
  const loadedId = mm.loadedId;
  const loadedStatus = loadedId ? mm.models[loadedId]?.status : null;

  useEffect(() => {
    let off = false;
    setGenerating(false);
    if (!loadedId) return undefined;
    loadChat(loadedId).then((m) => !off && setMessages(Array.isArray(m) ? m : []));
    return () => {
      off = true;
    };
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
                  postToKernel(window.opener, { type: "KENGINE_RESPONSE", requestId, response: answer });
                }
              } catch { /* La ventana de KERNEL puede haberse cerrado. */ }
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
                postToKernel(window.opener, { type: "KENGINE_ERROR", requestId, error: String(d.message || "Fallo en la generación local"), code: "generation_failed" });
              }
            } catch { /* La ventana de KERNEL puede haberse cerrado. */ }
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

  // Puente seguro KERNEL ↔ K.ENGINE (postMessage + WebLLM local).
  // HTTP /health /models /chat lo expone api/ en Vercel; este puente es solo ventana.
  // Orígenes KERNEL admitidos: ver src/engine/kernelBridge.js
  useEffect(() => {
    const opener = window.opener;
    if (!opener) return undefined;

    const announce = () => {
      try {
        if (!opener.closed) {
          postToKernel(opener, {
            type: "KENGINE_BRIDGE_READY",
            modelReady: Boolean(mmRef.current.loadedId) && mmRef.current.models[mmRef.current.loadedId]?.status === "READY",
            model: mmRef.current.loadedId || null,
          });
        }
      } catch { /* El opener puede haberse cerrado. */ }
    };

    const onMessage = (event) => {
      if (!isAllowedKernelOrigin(event.origin) || event.source !== window.opener) return;
      const data = event.data;
      if (!data || data.type !== "KERNEL_REQUEST") return;
      const replyOrigin = resolveKernelReplyOrigin(event.origin);
      const requestId = typeof data.requestId === "string" ? data.requestId.slice(0, 120) : "";
      const prompt = typeof data.message === "string" ? data.message.trim() : "";
      const replyError = (error, code) => {
        try {
          window.opener?.postMessage({ type: "KENGINE_ERROR", requestId, error, code }, replyOrigin);
        } catch { /* El opener puede haberse cerrado. */ }
      };
      if (!requestId || !prompt || prompt.length > 8000) {
        replyError("Solicitud vacía o demasiado larga (máximo 8000 caracteres).", "invalid_request");
        return;
      }
      const current = mmRef.current;
      const modelId = current.loadedId;
      const status = modelId ? current.models[modelId]?.status : null;
      if (status !== "READY") {
        replyError("K.ENGINE no tiene un modelo local listo. Abre K.ENGINE, inicia el motor y carga uno de los cuatro modelos hasta READY.", "model_not_ready");
        return;
      }
      if (keRef.current.bridgeRequestId || keRef.current.labGenId || keRef.current.job || generating) {
        replyError("K.ENGINE está ocupado con otra generación.", "busy");
        return;
      }
      keRef.current.bridgeRequestId = requestId;
      keRef.current.bridgeReplyOrigin = replyOrigin;
      const accepted = sendChat(prompt);
      if (!accepted) {
        keRef.current.bridgeRequestId = null;
        keRef.current.bridgeReplyOrigin = null;
        replyError("No se pudo iniciar la inferencia local. Comprueba que el modelo siga en READY.", "generation_not_started");
      }
    };

    window.addEventListener("message", onMessage);
    announce();
    return () => window.removeEventListener("message", onMessage);
  }, [loadedId, loadedStatus, generating, sendChat]);
