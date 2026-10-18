/**
 * KERNEL Intelligence Core — orquestador compartido por los 4 modelos WebLLM.
 *
 * Módulos:
 *  - evidenceAnalyzer  → hechos, indicios, alternativas, lagunas
 *  - moralReasoner     → facilita daño vs análisis defensivo
 *  - reportGenerator   → denuncias con límites de caracteres reales
 *  - outputValidator   → estructura y coherencia
 *
 * Principio: evidencia > intuición / presión social / deseo de complacer.
 * Las heurísticas marcan revisión; no establecen identidad, intención ni culpabilidad.
 */

export {
  analyzeEvidence,
  analyzeProfileEvidence,
  cleanText,
  SIGNALS,
} from "./intelligence/evidenceAnalyzer.js";

export { evaluateMoralAction } from "./intelligence/moralReasoner.js";

export {
  generateReport,
  charCount,
  fitToLimit,
  PLATFORM_LIMITS,
} from "./intelligence/reportGenerator.js";

export {
  validateAssessment,
  validateReport,
  detectUnsupportedCertainty,
} from "./intelligence/outputValidator.js";

import { analyzeEvidence, analyzeProfileEvidence } from "./intelligence/evidenceAnalyzer.js";
import { evaluateMoralAction } from "./intelligence/moralReasoner.js";
import { generateReport } from "./intelligence/reportGenerator.js";
import { validateAssessment } from "./intelligence/outputValidator.js";

/**
 * Contexto compacto inyectable en system prompt (todos los modelos).
 */
export function buildIntelligenceContext(input) {
  const evidence = analyzeEvidence(input);
  const moral = evaluateMoralAction(input);
  const lines = [
    "KERNEL INTELLIGENCE CORE:",
    "Prioriza hechos verificables. Separa observación, inferencia e hipótesis; indica qué fragmento respalda cada conclusión.",
    "No diagnostiques ni declares a una persona peligrosa o culpable por señales ambiguas. No uses identidad o apariencia como indicador.",
    "Las reglas automáticas son avisos para revisión, no veredictos. Considera citas, ironía, negación, contexto, repetición y fuente.",
    "Si faltan datos, dilo. En denuncias, no inventes leyes, pruebas, intenciones ni límites de plataforma.",
    "Principio: la evidencia prevalece sobre la intuición, la presión social y el deseo de complacer.",
  ];
  if (evidence.riskIndicators.length) {
    lines.push(
      "AVISO HEURÍSTICO (no es conclusión): " +
        evidence.riskIndicators.map((s) => s.label).join("; ") +
        "."
    );
    lines.push(
      "Revisa el contexto completo. Nivel orientativo: " +
        evidence.riskLevel +
        ". Confianza: " +
        evidence.confidence +
        "."
    );
  }
  if (moral.harmfulFacilitationRequested) {
    lines.push(
      "REVISIÓN MORAL: no proporciones instrucciones operativas que faciliten el daño. Ofrece prevención, protección o documentación segura."
    );
  } else if (moral.result === "allow_defensive_analysis") {
    lines.push(
      "ANÁLISIS DEFENSIVO/DENUNCIA: permitido. Mantén hechos vs inferencias; no facilites métodos de daño."
    );
  }
  return lines.join("\n");
}

/**
 * Pipeline pre-inferencia: evidencia + moral + contexto para el modelo.
 */
export function runPreInference(userText) {
  const evidence = analyzeEvidence(userText);
  const moral = evaluateMoralAction(userText);
  const contextBlock = buildIntelligenceContext(userText);
  return {
    evidence,
    moral,
    contextBlock,
    modulesRun: ["evidenceAnalyzer", "moralReasoner", "buildIntelligenceContext"],
  };
}

/**
 * Post-inferencia: si moral bloquea facilitación, sustituye salida.
 */
export function runPostInference(assistantText, userText) {
  const moral = evaluateMoralAction(userText);
  if (moral.harmfulFacilitationRequested && moral.safeAlternative) {
    return {
      text: moral.safeAlternative,
      overridden: true,
      reason: "moral_stop_facilitation",
      moral,
      modulesRun: ["moralReasoner"],
    };
  }
  return {
    text: assistantText,
    overridden: false,
    reason: null,
    moral,
    modulesRun: ["moralReasoner"],
  };
}

/** Re-export helpers used by tests / UI diagnostics */
export const IntelligenceAPI = {
  analyzeEvidence,
  analyzeProfileEvidence,
  evaluateMoralAction,
  generateReport,
  validateAssessment,
  buildIntelligenceContext,
  runPreInference,
  runPostInference,
};
