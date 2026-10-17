// Personalidad de KERNEL. Fuente única para lab, server.js y api/kengine.mjs.
import { SYSTEM_PROMPT_FULL } from "./personality.full.js";
import { SYSTEM_PROMPT_SMALL } from "./personality.small.js";

export const KERNEL_PERSONALITY = {
  name: "KERNEL",
  fullName: "K.E.R.N.E.L. (KERNEL AI ENGINE)",
  role: "Motor de análisis universal para redes sociales, denuncias y moderación",
  systemPrompt: SYSTEM_PROMPT_FULL,
  systemPromptSmall: SYSTEM_PROMPT_SMALL,
};

/** Modelos pequeños: prompt corto para no saturar el contexto. */
const SMALL_MODEL_RE = /0\.5[Bb]|1[Bb]|-0\.5B|-1B|1B-Instruct|0\.5B-Instruct/i;

/**
 * @param {string|null|undefined} modelId id WebLLM o alias (llama-3.2-1b, qwen2.5-0.5b, …)
 * @returns {string}
 */
export function getSystemPrompt(modelId) {
  const id = String(modelId || "");
  if (SMALL_MODEL_RE.test(id)) return SYSTEM_PROMPT_SMALL;
  return SYSTEM_PROMPT_FULL;
}
