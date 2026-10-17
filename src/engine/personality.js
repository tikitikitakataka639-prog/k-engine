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

/** Modelos pequeños por nombre (0.5B / 1B). */
const SMALL_MODEL_RE = /0\.5[Bb]|1[Bb]|-0\.5B|-1B|1B-Instruct|0\.5B-Instruct/i;

/**
 * Elige system prompt según modelo y ventana de contexto.
 * Ventanas ≤8192 (o desconocidas) → corto: el largo (~17k chars) no cabe en 4096.
 * @param {string|null|undefined} modelId
 * @param {number|null|undefined} [contextWindow]
 */
export function getSystemPrompt(modelId, contextWindow) {
  const id = String(modelId || "");
  const ctx = Number(contextWindow);
  if (SMALL_MODEL_RE.test(id)) return SYSTEM_PROMPT_SMALL;
  if (!Number.isFinite(ctx) || ctx < 8192) return SYSTEM_PROMPT_SMALL;
  return SYSTEM_PROMPT_FULL;
}
