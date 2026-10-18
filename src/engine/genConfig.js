/**
 * Parámetros de generación por modelo.
 * Fuente de verdad: modelProfiles.js
 */
import { getGenConfigForModel } from "./modelProfiles.js";

/**
 * @param {string} modelId
 * @returns {{ temperature: number, top_p: number, max_tokens: number }}
 */
export function getGenConfig(modelId) {
  return getGenConfigForModel(modelId);
}
