/**
 * personalityInjector.js
 * Orquesta: system KERNEL + perfiles SLM + math tool + contexto + genConfig.
 * El lab y el bridge usan la misma ruta: injectPersonality → generate → finalizeAssistantText.
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

  const useFs =
    includeFewShot === true ||
    (includeFewShot !== false && profile.useFewShot && !math.hit && workHistory.length <= 2);
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

/**
 * Post-proceso de salida. Si math.hit, el resultado verificado manda.
 * Re-resuelve math desde userText si no viene en opts (ruta lab robusta).
 */
export function finalizeAssistantText(raw, userText, opts = {}) {
  let math = opts.math || null;
  if (!math?.hit && userText) {
    const resolved = trySolveMath(userText);
    if (resolved.hit) math = resolved;
  }
  const mathHit = opts.mathHit ?? math?.hit ?? false;
  const mathData = opts.mathData ?? math?.data ?? null;
  const mathSummary = opts.mathSummary ?? math?.summary ?? "";
  return guardAssistantOutput(raw, userText, {
    mathHit: Boolean(mathHit),
    mathData,
    mathSummary,
  });
}

export function sanitizeCorporateRefusal(text) {
  return guardAssistantOutput(text, "");
}
