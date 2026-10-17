/**
 * modelRegistry.js
 * ----------------
 * Ciclo de vida de los modelos KERNEL en K.ENGINE:
 *
 *   CÓDIGO (permanente)
 *     └─ Definición del modelo: id, label, HF, VRAM, contextWindow, flags.
 *        Nunca se borra. Siempre está en este archivo.
 *
 *   NAVEGADOR (temporal)
 *     └─ Al pulsar DESCARGAR: WebLLM trae los pesos (shards MLC) a Cache Storage.
 *        El modelo pasa a estado DOWNLOADED / READY.
 *
 *   FORMATEAR
 *     └─ Borra los pesos del navegador (Cache API).
 *        El modelo vuelve a existir SOLO en el código (NOT_DOWNLOADED).
 *        Se puede volver a descargar cuando quieras.
 *
 * Los pesos NO caben en el repo (cientos de MB / GB). Aquí solo vive la ficha.
 * Las URLs reales (model + model_lib) las aporta @mlc-ai/web-llm (prebuiltAppConfig);
 * nosotros las resolvemos en runtime y aplicamos overrides KERNEL.
 */

/** IDs oficiales WebLLM / MLC de los 4 modelos KERNEL. */
export const KERNEL_MODEL_IDS = [
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
];

export const DEFAULT_MODEL_ID = KERNEL_MODEL_IDS[0];

/**
 * Fichas permanentes en código.
 * contextWindow: usado por personalityInjector / chatContext.
 * location: dónde vive cada parte.
 */
export const KERNEL_MODELS = {
  "Llama-3.2-1B-Instruct-q4f16_1-MLC": {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama-3.2-1B Instruct · q4f16_1",
    family: "Llama-3.2",
    size: "1B",
    quant: "q4f16_1",
    contextWindow: 4096,
    vramMB: 1128.95,
    lowResource: true,
    personality: "small", // system prompt corto + few-shot
    location: {
      definition: "code", // siempre en modelRegistry.js
      weights: "browser-cache", // solo tras DESCARGAR
    },
  },
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC": {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5-0.5B Instruct · q4f16_1",
    family: "Qwen2.5",
    size: "0.5B",
    quant: "q4f16_1",
    contextWindow: 4096,
    vramMB: 944.62,
    lowResource: true,
    personality: "small",
    location: {
      definition: "code",
      weights: "browser-cache",
    },
  },
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC": {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5-1.5B Instruct · q4f16_1",
    family: "Qwen2.5",
    size: "1.5B",
    quant: "q4f16_1",
    contextWindow: 4096,
    vramMB: 1629.97,
    lowResource: true,
    personality: "small",
    location: {
      definition: "code",
      weights: "browser-cache",
    },
  },
  "Llama-3.2-3B-Instruct-q4f16_1-MLC": {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama-3.2-3B Instruct · q4f16_1",
    family: "Llama-3.2",
    size: "3B",
    quant: "q4f16_1",
    contextWindow: 4096,
    vramMB: 2260.66,
    lowResource: false,
    personality: "full", // system prompt completo si el ctx lo permite
    location: {
      definition: "code",
      weights: "browser-cache",
    },
  },
};

export function getKernelModel(id) {
  return KERNEL_MODELS[id] || null;
}

export function isKernelModel(id) {
  return Boolean(KERNEL_MODELS[id]);
}

/**
 * Construye el appConfig que usa el worker / hasModelInCache.
 * - Parte de prebuiltAppConfig de @mlc-ai/web-llm (URLs reales de HF + wasm).
 * - Se queda solo con los 4 modelos KERNEL (o los que existan en esa versión).
 * - Aplica overrides de context_window desde nuestro registro.
 *
 * @param {object} prebuilt — webllm.prebuiltAppConfig
 * @returns {{ appConfig: object, missing: string[], resolved: object[] }}
 */
export function buildKernelAppConfig(prebuilt) {
  if (!prebuilt || !Array.isArray(prebuilt.model_list)) {
    throw new Error("prebuiltAppConfig.model_list no disponible");
  }

  const byId = new Map(prebuilt.model_list.map((r) => [r.model_id, r]));
  const resolved = [];
  const missing = [];

  for (const id of KERNEL_MODEL_IDS) {
    const base = byId.get(id);
    const meta = KERNEL_MODELS[id];
    if (!base) {
      missing.push(id);
      continue;
    }
    const overrides = {
      ...(base.overrides || {}),
      context_window_size: meta?.contextWindow || base.overrides?.context_window_size || 4096,
    };
    resolved.push({
      ...base,
      overrides,
      // Metadatos KERNEL (no los usa WebLLM; útiles para debug / UI)
      kernel: {
        label: meta?.label,
        personality: meta?.personality,
        location: meta?.location,
      },
    });
  }

  const appConfig = {
    ...prebuilt,
    model_list: resolved,
  };

  return { appConfig, missing, resolved };
}

/**
 * Estado lógico del ciclo de vida (para UI / logs).
 * @param {boolean|null} cached — hasModelInCache
 * @param {string} status — estado ModelManager
 */
export function lifecyclePhase(cached, status) {
  if (status === "READY" || status === "GENERATING") {
    return { phase: "IN_BROWSER_LOADED", label: "En navegador (GPU/RAM)" };
  }
  if (status === "DOWNLOADING" || status === "LOADING" || status === "VERIFYING") {
    return { phase: "MOVING_TO_BROWSER", label: "Pasando código → navegador…" };
  }
  if (status === "DELETING" || status === "UNLOADING") {
    return { phase: "MOVING_TO_CODE", label: "Devolviendo a código (borrando del navegador)…" };
  }
  if (cached || status === "DOWNLOADED") {
    return { phase: "IN_BROWSER_DISK", label: "En navegador (caché, no en memoria)" };
  }
  return { phase: "IN_CODE_ONLY", label: "Solo en código (sin pesos en el navegador)" };
}
