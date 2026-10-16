import { createContext, useContext } from "react";

const EngineContext = createContext(null);
export function useEngine() {
  const v = useContext(EngineContext);
  if (!v) throw new Error("useEngine debe usarse dentro de EngineProvider");
  return v;
}

export function parseKernelUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return { ok: false, error: "Introduce una URL." };
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol)) return { ok: false, error: "Solo se admiten URLs http:// o https://." };
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, error: "URL no válida." };
  }
}

/** Stub de emergencia: la UI carga; restaurar EngineProvider completo desde commit d5c064b. */
export function EngineProvider({ children }) {
  const value = {
    mm: { loadedId: null, models: {}, catalog: { featured: [] } },
    loadedId: null,
    classes: {},
    classify: () => null,
    selectModel: () => {},
    download: () => {},
    cancelDownload: () => {},
    unload: () => {},
    deleteModel: async () => ({}),
    formatResult: null,
    startPhase: "IDLE",
    startError: "Restaurar EngineProvider.jsx desde commit d5c064b (archivo truncado en deploy).",
    startEngine: async () => {},
    hardware: {},
    manualVram: null,
    setManualVram: () => {},
    kernelUrl: "",
    kernelUrlError: null,
    saveKernelUrl: () => false,
    clearKernelUrl: () => {},
    messages: [],
    sendChat: () => false,
    cancelGenerate: () => {},
    resetChat: () => {},
    labError: null,
    generating: false,
    metrics: { tokens: "N/A", tps: "N/A", genTime: "N/A", firstTok: "N/A" },
    chatReady: false,
    inMemory: false,
    control: { cacheSummary: "", diagOut: "", cfgBackend: "auto", cfgBaseUrl: "", cfgApiKey: "", cfgModel: "", cfgToken: "", cfgKeyState: "", cfgMsg: "", cfgDisabled: true, ksBridge: "—" },
    patchControl: () => {},
    saveConfig: async () => {},
    testConfig: async () => {},
    refreshCache: async () => {},
    runDiagnosis: async () => {},
    statusLines: ["EngineProvider en modo emergencia"],
    CLASS: { UNKNOWN: "unknown" },
  };
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}
