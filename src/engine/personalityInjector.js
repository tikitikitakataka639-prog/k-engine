/**
 * personalityInjector.js
 * System prompt KERNEL + ajuste de contexto.
 * finalizeAssistantText: corta plantillas corporativas residuales del modelo base.
 */

import { getSystemPrompt } from "./personality.js";
import { buildFitMessages } from "./chatContext.js";
import { getGenConfig } from "./genConfig.js";

export function injectPersonality({
  systemPrompt,
  modelId,
  contextWindow,
  history,
  maxTokens,
  includeFewShot = false,
}) {
  const ctx = Number(contextWindow) || 4096;
  const system = systemPrompt || getSystemPrompt(modelId, ctx);
  const gen = getGenConfig(modelId);
  const reply = maxTokens != null ? maxTokens : gen.max_tokens;

  const result = buildFitMessages({
    systemPrompt: system,
    history: history || [],
    contextWindow: ctx,
    maxTokens: reply,
  });

  return {
    ...result,
    temperature: gen.temperature,
    top_p: gen.top_p,
  };
}

const CORPORATE_RE =
  /lo siento,?\s*pero\s+no\s+puedo|como\s+ia\s+no\s+(puedo|debo)|no\s+puedo\s+(proporcionar|ayudar|asistir|ofrecer)|asistencia\s+para\s+(abuso|violencia)|no\s+estoy\s+autorizad[oa]|te\s+recomiendo\s+contactar\s+con\s+(un\s+)?(profesional|organizaci)/i;

/**
 * Si el modelo base suelta una plantilla de rechazo ante un input legítimo, la sustituye.
 */
export function finalizeAssistantText(raw, userText) {
  const t = String(raw || "").trim();
  if (!t) return t;
  if (!CORPORATE_RE.test(t)) return t;

  const u = String(userText || "").trim().toLowerCase();
  if (!u || /^(hola|hey|buenas|hello|hi|saludos|qué tal|que tal|buenos días|buenas tardes)\b/.test(u) || u.length < 48) {
    if (/^(hola|hey|buenas|hello|hi|saludos)\b/.test(u)) {
      return "Hola. ¿Qué necesitas?";
    }
    return "Vale. Dime qué necesitas y vamos al grano.";
  }
  if (/ley|artículo|art\.?\s*\d+|grooming|denuncia|menor|protección|acoso|código penal|183/.test(u)) {
    return (
      "Eso es información legítima, no ayuda a delinquir. " +
      "Resume tu pregunta concreta (p. ej. qué dice el art. 183 CP o qué pasos dar ante un caso) y te respondo con hechos."
    );
  }
  return "Eso no es un rechazo de KERNEL. Reformula en una frase qué necesitas (análisis, ley, denuncia, texto) y lo trato.";
}

export function sanitizeCorporateRefusal(text) {
  return finalizeAssistantText(text, "");
}
