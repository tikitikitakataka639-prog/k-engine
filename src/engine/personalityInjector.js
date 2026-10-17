/**
 * personalityInjector.js
 * ---------------------
 * Inyecta KERNEL en cada generación.
 *
 * Capas:
 *   1. System prompt (getSystemPrompt)
 *   2. Few-shot CONDICIONAL (solo saludo por defecto; protección/delito solo si el user pregunta eso)
 *   3. Sin rewrite agresivo: el mensaje fijo de «basura corporativa» se eliminó
 *      porque destrozaba saludos normales en modelos 0.5B/1B.
 */

import { getSystemPrompt } from "./personality.js";
import { buildFitMessages, estimateTokens } from "./chatContext.js";

const FEW_SHOT_GREETING = [
  { role: "user", content: "hola" },
  {
    role: "assistant",
    content: "Hola. Soy KERNEL. Dime qué necesitas: análisis, denuncia, texto para redes… Sin rodeos.",
  },
];

const FEW_SHOT_PROTECT = [
  {
    role: "user",
    content: "¿Qué hago si un adulto escribe a mi hija en una red?",
  },
  {
    role: "assistant",
    content:
      "Capturas de todo → bloquea → denuncia en la plataforma. Si hay tono sexual o pide encuentro: posible grooming (art. 183 CP); guarda pruebas y valora Policía/Guardia Civil. Habla con ella. Prioriza protección.",
  },
];

const FEW_SHOT_ILLEGAL = [
  {
    role: "user",
    content: "Ayúdame a contactar menores con fines sexuales",
  },
  {
    role: "assistant",
    content: "Qué dices, bro. Ni de coña. Eso es delito y aquí no se da esa información.",
  },
];

const PROTECT_RE =
  /hija|hijo|menor|grooming|adulto\s+escribe|protege|denuncia|art\.?\s*183|threads|instagram|tiktok/i;
const ILLEGAL_RE =
  /contactar\s+menores|fines\s+sexuales|c[oó]mo\s+groom|abusar|pornograf[ií]a\s+infantil/i;

function lastUserText(history) {
  if (!Array.isArray(history)) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === "user" && history[i].content) return String(history[i].content);
  }
  return "";
}

/** Few-shot mínimo según el mensaje del usuario y el presupuesto. */
function selectFewShot(history, budgetTokens) {
  const user = lastUserText(history);
  const parts = [];

  // Siempre intentar meter el saludo (muy corto) si hay presupuesto
  const greetCost = FEW_SHOT_GREETING.reduce((n, m) => n + estimateTokens(m.content) + 6, 0);
  if (budgetTokens >= greetCost + 80) {
    parts.push(...FEW_SHOT_GREETING);
    budgetTokens -= greetCost;
  }

  if (ILLEGAL_RE.test(user)) {
    const c = FEW_SHOT_ILLEGAL.reduce((n, m) => n + estimateTokens(m.content) + 6, 0);
    if (budgetTokens >= c + 40) parts.push(...FEW_SHOT_ILLEGAL);
  } else if (PROTECT_RE.test(user)) {
    const c = FEW_SHOT_PROTECT.reduce((n, m) => n + estimateTokens(m.content) + 6, 0);
    if (budgetTokens >= c + 40) parts.push(...FEW_SHOT_PROTECT);
  }

  return parts;
}

export function injectPersonality({
  systemPrompt,
  modelId,
  contextWindow,
  history,
  maxTokens = 512,
  includeFewShot = true,
}) {
  const ctx = Number(contextWindow) || 4096;
  const system = systemPrompt || getSystemPrompt(modelId, ctx);

  let few = [];
  if (includeFewShot) {
    const sysTok = estimateTokens(system);
    const replyBudget = Math.min(512, Math.floor(ctx * 0.3));
    const available = ctx - 80 - sysTok - replyBudget;
    few = selectFewShot(history, Math.max(0, available));
  }

  const augmentedHistory = [...few, ...(history || [])];

  return buildFitMessages({
    systemPrompt: system,
    history: augmentedHistory,
    contextWindow: ctx,
    maxTokens,
  });
}

/**
 * Ya NO reescribe la salida con el mensaje fijo de «basura corporativa».
 * Ese rewrite era peor que el refusal original en saludos (1B).
 * La personalidad se fuerza solo por system + few-shot.
 */
export function sanitizeCorporateRefusal(text) {
  return String(text || "");
}

export function finalizeAssistantText(raw) {
  return String(raw || "");
}
