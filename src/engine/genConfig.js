/**
 * Parámetros de generación por tamaño de modelo.
 * Modelos pequeños necesitan menos creatividad y más determinismo.
 */

import { getKernelModel } from "./modelRegistry.js";

const DEFAULTS = {
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 512,
};

/** Configuración por familia/tamaño. */
const BY_SIZE = {
  "0.5B": { temperature: 0.5, top_p: 0.85, max_tokens: 384 },
  "1B": { temperature: 0.55, top_p: 0.9, max_tokens: 512 },
  "1.5B": { temperature: 0.6, top_p: 0.9, max_tokens: 640 },
  "3B": { temperature: 0.65, top_p: 0.92, max_tokens: 768 },
};

/**
 * @param {string} modelId
 * @returns {{ temperature: number, top_p: number, max_tokens: number }}
 */
export function getGenConfig(modelId) {
  const meta = getKernelModel(modelId);
  const size = meta?.size || "1B";
  return { ...DEFAULTS, ...(BY_SIZE[size] || BY_SIZE["1B"]) };
}
