/**
 * personalityInjector.js
 * Solo system prompt KERNEL + ajuste de contexto.
 * Few-shot desactivado por defecto: en 0.5B/1B contaminaba saludos y tareas normales.
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

export function finalizeAssistantText(raw) {
  return String(raw || "");
}

export function sanitizeCorporateRefusal(text) {
  return String(text || "");
}
