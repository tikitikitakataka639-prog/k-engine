/**
 * personalityInjector.js
 * Orquesta: system KERNEL + perfiles SLM + math tool + contexto + genConfig.
 */

import { getSystemPrompt } from "./personality.js";
import { buildFitMessages } from "./chatContext.js";
import { getGenConfig } from "./genConfig.js";
import { getModelProfile, SLM_REASONING_BLOCK, SLM_FEWSHOT } from "./modelProfiles.js";
import { trySolveMath, mathContextNote } from "./mathTools.js";
import { guardAssistantOutput } from "./outputGuard.js";

export function injectPersonality({
  systemPrompt,
  modelId,
  contextWindow,
  history,
  maxTokens,
  includeFewShot,
}) {
  const ctx = Number(contextWindow) || 4096;
  const profile = getModelProfile(modelId);
  const gen = getGenConfig(modelId);
  const reply = maxTokens != null ? maxTokens : gen.max_tokens;

  const hist = Array.isArray(history) ? history : [];
  const lastUser = [...hist].reverse().find((m) => m.role === "user")?.content || "";

  const math = trySolveMath(lastUser);
  const mathNote = math.hit ? mathContextNote(math) : "";

  let system = (systemPrompt || getSystemPrompt(modelId, ctx)).trim();
  if (profile.useSlmBlock) {
    system = system + "\n\n" + SLM_REASONING_BLOCK;
  }
  if (mathNote) {
    system = system + "\n\n" + mathNote;
  }

  let workHistory = hist.map((m) => ({ role: m.role, content: String(m.content || "") }));
  const maxMsgs = profile.maxHistoryTurns * 2;
  if (workHistory.length > maxMsgs) {
    workHistory = workHistory.slice(-maxMsgs);
  }

  const useFs = includeFewShot === true || (includeFewShot !== false && profile.useFewShot && !math.hit && workHistory.length <= 2);
  if (useFs) {
    workHistory = [...SLM_FEWSHOT, ...workHistory];
  }

  const result = buildFitMessages({
    systemPrompt: system,
    history: workHistory,
    contextWindow: ctx,
    maxTokens: reply,
  });

  return {
    ...result,
    temperature: gen.temperature,
    top_p: gen.top_p,
    math,
    profile,
  };
}

export function finalizeAssistantText(raw, userText, opts = {}) {
  return guardAssistantOutput(raw, userText, opts);
}

export function sanitizeCorporateRefusal(text) {
  return guardAssistantOutput(text, "");
}
