// Personalidad de KERNEL. Fuente única para lab, server.js y api/kengine.mjs.
// Todos los modelos del modelRegistry llevan kernelPersonality + corporateLimits: false.
import { SYSTEM_PROMPT_FULL } from "./personality.full.js";
import { SYSTEM_PROMPT_SMALL } from "./personality.small.js";
import { SYSTEM_PROMPT_3B } from "./personality.3b.js";
import { getKernelModel } from "./modelRegistry.js";

export const KERNEL_PERSONALITY = {
  name: "KERNEL",
  fullName: "K.E.R.N.E.L. (KERNEL AI ENGINE)",
  role: "Motor de análisis universal para redes sociales, denuncias y moderación",
  systemPrompt: SYSTEM_PROMPT_FULL,
  systemPromptSmall: SYSTEM_PROMPT_SMALL,
  systemPrompt3B: SYSTEM_PROMPT_3B,
  corporateLimits: false,
  badge: "KERNEL · sin límites corporativos",
};

const SMALL_MODEL_RE = /0\.5[Bb]|1[Bb]|-0\.5B|-1B|1B-Instruct|0\.5B-Instruct/i;

/**
 * Elige system prompt KERNEL según registro / tamaño / contexto.
 * - Modelos del registry con personality: "small" | "full"
 * - ctx ≤ 8192 o desconocido → small (el full no cabe en 4096)
 * Siempre es KERNEL sin plantillas corporativas (definido en los prompts).
 */
export function getSystemPrompt(modelId, contextWindow) {
  const id = String(modelId || "");
  const ctx = Number(contextWindow);
  const meta = getKernelModel(id);

  if (meta?.personality === "3b") return SYSTEM_PROMPT_3B;
  if (meta?.personality === "full" && Number.isFinite(ctx) && ctx >= 8192) {
    return SYSTEM_PROMPT_FULL;
  }
  if (meta?.personality === "small") {
    return SYSTEM_PROMPT_SMALL;
  }
  if (SMALL_MODEL_RE.test(id)) return SYSTEM_PROMPT_SMALL;
  if (!Number.isFinite(ctx) || ctx < 8192) return SYSTEM_PROMPT_SMALL;
  return SYSTEM_PROMPT_FULL;
}
