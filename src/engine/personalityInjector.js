/**
 * personalityInjector.js
 * Orquesta: system KERNEL + perfiles SLM + math + Intelligence Core + contexto + genConfig.
 * Los contextos dinámicos prioritarios van al principio para que el recorte del contexto
 * no los elimine en los modelos con un system prompt largo (especialmente Llama 3.2 3B).
 * Lab y bridge: injectPersonality → generate → finalizeAssistantText.
 */

import { getSystemPrompt } from "./personality.js";
import { KERNEL_BRAIN } from "./kernelBrain.js";
import { buildDenunciaKnowledgeContext } from "./denunciaKnowledge.js";
import { buildFitMessages } from "./chatContext.js";
import { getGenConfig } from "./genConfig.js";
import { getModelProfile, SLM_REASONING_BLOCK, SLM_FEWSHOT, KERNEL_3B_FEWSHOT } from "./modelProfiles.js";
import { trySolveMath, mathContextNote } from "./mathTools.js";
import { guardAssistantOutput } from "./outputGuard.js";
import {
  evaluateMoralAction,
  runPreInference,
} from "./intelligenceCore.js";

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
  const pre = runPreInference(lastUser);
  const baseSystem = (systemPrompt || getSystemPrompt(modelId, ctx)).trim();
  const denunciaContext = buildDenunciaKnowledgeContext(lastUser);

  // buildFitMessages recorta el system por el final. Colocar primero las instrucciones
  // específicas evita perderlas detrás del prompt de personalidad de 3B.
  const priorityContext = [
    mathNote,
    denunciaContext,
    pre.contextBlock,
  ].filter((part) => typeof part === "string" && part.trim());

  // El núcleo compacto va antes del prompt de personalidad variable: buildFitMessages\n  // recorta por el final y así conserva el método y la identidad esenciales.\n  const systemParts = [...priorityContext, KERNEL_BRAIN, baseSystem];
  if (profile.useSlmBlock) systemParts.push(SLM_REASONING_BLOCK);
  const system = systemParts.join("\n\n");

  let workHistory = hist.map((m) => ({ role: m.role, content: String(m.content || "") }));
  const maxMsgs = profile.maxHistoryTurns * 2;
  if (workHistory.length > maxMsgs) {
    workHistory = workHistory.slice(-maxMsgs);
  }

  const asksForAnalysis =
    /\b(analiza|análisis|investiga|investigación|hechos|indicios|hipótesis|evidencia|pruebas|contradicci[oó]n|denuncia|evalúa|evalua|compara|razona|demuestra|concluye)\b/i.test(lastUser);
  const useFs =
    includeFewShot === true ||
    (includeFewShot !== false &&
      ((profile.useFewShot && !math.hit && workHistory.length <= 2) ||
        (profile.size === "3B" && asksForAnalysis && !math.hit)));
  if (useFs) {
    const examples = profile.size === "3B" ? KERNEL_3B_FEWSHOT : SLM_FEWSHOT;
    workHistory = [...examples, ...workHistory];
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
    intelligence: {
      evidence: pre.evidence,
      moral: pre.moral,
      modulesRun: pre.modulesRun,
    },
  };
}

/**
 * Post-proceso. Moral (facilitación de daño) → math verificado → outputGuard.
 */
export function finalizeAssistantText(raw, userText, opts = {}) {
  const moral = evaluateMoralAction(userText || "");
  if (moral.harmfulFacilitationRequested && moral.safeAlternative) {
    return moral.safeAlternative;
  }

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
