/**
 * modelRegistry.js
 * ----------------
 * Ciclo de vida de los modelos KERNEL en K.ENGINE:
 *
 *   CÓDIGO (permanente) — ficha + PERSONALIDAD KERNEL SIN LÍMITES CORPORATIVOS
 *     · Llama-3.2-1B-Instruct-q4f16_1-MLC
 *     · Qwen2.5-0.5B-Instruct-q4f16_1-MLC
 *     · Qwen2.5-1.5B-Instruct-q4f16_1-MLC
 *     · Llama-3.2-3B-Instruct-q4f16_1-MLC
 *
 *     Cada ficha lleva:
 *       kernelPersonality: true
 *       corporateLimits: false
 *       → al DESCARGAR / generar, personalityInjector aplica KERNEL
 *         (system prompt + few-shot + filtro anti-refusal).
 *
 *   NAVEGADOR (temporal)
 *     └─ DESCARGAR: pesos MLC → Cache Storage + GPU.
 *
 *   FORMATEAR
 *     └─ Borra pesos del navegador. La ficha KERNEL sigue en este archivo.
 *
 * Los pesos NO están en el repo. Aquí solo la ficha + bandera de personalidad.
 */

/** IDs oficiales WebLLM / MLC de los 4 modelos KERNEL. */
export const KERNEL_MODEL_IDS = [
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
];

export const DEFAULT_MODEL_ID = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

/** Flags comunes: todos los modelos del registro son KERNEL sin límites corporativos. */
const KERNEL_FLAGS = {
  kernelPersonality: true,
  corporateLimits: false,
  /** Etiqueta UI / logs */
  badge: "KERNEL · sin límites corporativos",
};

/**
 * Fichas permanentes en código.
 * personality: "small" | "full" → qué system prompt usa getSystemPrompt / injector.
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
    personality: "small",
    ...KERNEL_FLAGS,
    location: { definition: "code", weights: "browser-cache" },
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
    ...KERNEL_FLAGS,
    location: { definition: "code", weights: "browser-cache" },
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
    ...KERNEL_FLAGS,
    location: { definition: "code", weights: "browser-cache" },
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
    // Prompt compacto específico para obediencia y análisis con contexto 4096.
    personality: "3b",
    ...KERNEL_FLAGS,
    location: { definition: "code", weights: "browser-cache" },
  },
};

export function getKernelModel(id) {
  return KERNEL_MODELS[id] || null;
}

export function isKernelModel(id) {
  return Boolean(KERNEL_MODELS[id]);
}

/** True si el modelo debe forzar inyector KERNEL (todos los del registro). */
export function requiresKernelPersonality(id) {
  const m = KERNEL_MODELS[id];
  return Boolean(m && m.kernelPersonality && m.corporateLimits === false);
}

/**
 * Construye appConfig para worker / Cache API.
 * Solo modelos del registro + overrides de contexto + metadatos KERNEL.
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
      kernel: {
        label: meta.label,
        personality: meta.personality,
        kernelPersonality: meta.kernelPersonality,
        corporateLimits: meta.corporateLimits,
        badge: meta.badge,
        location: meta.location,
      },
    });
  }

  return {
    appConfig: { ...prebuilt, model_list: resolved },
    missing,
    resolved,
  };
}

export function lifecyclePhase(cached, status) {
  if (status === "READY" || status === "GENERATING") {
    return { phase: "IN_BROWSER_LOADED", label: "En navegador (GPU/RAM) · KERNEL activo" };
  }
  if (status === "DOWNLOADING" || status === "LOADING" || status === "VERIFYING") {
    return { phase: "MOVING_TO_BROWSER", label: "Código → navegador (KERNEL sin límites)…" };
  }
  if (status === "DELETING" || status === "UNLOADING") {
    return { phase: "MOVING_TO_CODE", label: "Navegador → código…" };
  }
  if (cached || status === "DOWNLOADED") {
    return { phase: "IN_BROWSER_DISK", label: "En navegador (caché) · KERNEL al cargar" };
  }
  return { phase: "IN_CODE_ONLY", label: "Solo en código · KERNEL · sin límites corporativos" };
}
