// Catálogo KERNEL: las fichas viven en modelRegistry.js (código permanente).
// Las URLs/wasm reales las resuelve @mlc-ai/web-llm; nosotros filtramos a los 4 destacados.

import {
  DEFAULT_MODEL_ID,
  KERNEL_MODEL_IDS,
  KERNEL_MODELS,
  buildKernelAppConfig,
  getKernelModel,
  isKernelModel,
  lifecyclePhase,
} from "./modelRegistry.js";

export {
  DEFAULT_MODEL_ID,
  KERNEL_MODEL_IDS,
  KERNEL_MODELS,
  buildKernelAppConfig,
  getKernelModel,
  isKernelModel,
  lifecyclePhase,
};

/** @deprecated usar KERNEL_MODEL_IDS */
export const FEATURED_IDS = KERNEL_MODEL_IDS;

let webllmPromise = null;
/** Carga perezosa del paquete npm (solo se usa en el hilo principal para metadatos y gestión de caché). */
export function loadWebLLM() {
  webllmPromise ||= import("@mlc-ai/web-llm");
  return webllmPromise;
}

function describe(record, kernelMeta) {
  const id = record.model_id;
  const features = record.required_features || [];
  const needsF16 = features.includes("shader-f16") || /q4f16|q0f16/.test(id);
  const meta = kernelMeta || KERNEL_MODELS[id] || {};
  const label =
    meta.label ||
    id.replace(/-MLC(-1k)?$/i, "").replace(/-Instruct/i, " Instruct").replace(/-q(\d)f(\d+)_(\d)/i, " · q$1f$2_$3");
  return {
    id,
    label,
    hf: String(record.model || "").replace("https://huggingface.co/", ""),
    vramMB: meta.vramMB ?? record.vram_required_MB ?? null,
    lowResource: meta.lowResource ?? record.low_resource_required ?? null,
    contextWindow: meta.contextWindow ?? record.overrides?.context_window_size ?? 4096,
    requiredFeatures: needsF16 ? Array.from(new Set([...features, "shader-f16"])) : features,
    isVision: Boolean(record.model_type === 2 || /vision|llava/i.test(id)),
    featured: isKernelModel(id),
    personality: meta.personality || "small",
    location: meta.location || { definition: "code", weights: "browser-cache" },
  };
}

/**
 * @returns {Promise<{
 *   models: object[],
 *   featured: object[],
 *   missingFeatured: string[],
 *   version: string|null,
 *   total: number,
 *   appConfig: object|null
 * }>}
 */
export async function loadCatalog() {
  const webllm = await loadWebLLM();
  const { appConfig, missing, resolved } = buildKernelAppConfig(webllm.prebuiltAppConfig);

  // Catálogo UI = solo modelos KERNEL resueltos (+ aviso de missing)
  const featured = resolved.map((r) => describe(r, KERNEL_MODELS[r.model_id]));
  // models = mismos destacados (K.ENGINE no expone el catálogo completo de WebLLM en la UI)
  const models = featured.slice();

  return {
    models,
    featured,
    missingFeatured: missing,
    version: webllm.version || null,
    total: models.length,
    appConfig,
  };
}
