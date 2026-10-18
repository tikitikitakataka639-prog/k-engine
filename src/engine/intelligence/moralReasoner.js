/**
 * moralReasoner.js
 * Evalúa peticiones de asistencia (no el valor moral de personas).
 * Distingue: ilegalidad vs inmoralidad vs controversia vs desacuerdo.
 * Bloquea solo facilitación operativa de daño; permite análisis defensivo/denuncia.
 */

import { cleanText } from "./evidenceAnalyzer.js";

const HARMFUL_FACILITATION =
  /\b(c[oó]mo (?:puedo|hacer para) (?:abusar|chantajear|extorsionar|acosar|amenazar|evadir a la polic[ií]a)|ay[uú]dame a (?:abusar|extorsionar|acosar|amenazar|ocultar pruebas)|c[oó]mo ocultar pruebas de (?:un delito|abuso|agresi[oó]n)|crear (?:pornograf[ií]a infantil|material sexual de menores)|instrucciones para (?:violar|abusar de un menor))\b/i;

const DEFENSIVE_ANALYSIS =
  /\b(denuncia|denunciar|reportar|analiza|an[aá]lisis|es esto acoso|es ilegal|art[ií]culo|c[oó]digo penal|proteger|v[ií]ctima|pruebas para la polic[ií]a|c[oó]mo documentar)\b/i;

export function evaluateMoralAction(input) {
  const text = cleanText(input);
  const harmfulFacilitationRequested = HARMFUL_FACILITATION.test(text);
  const isDefensiveAnalysis = DEFENSIVE_ANALYSIS.test(text);

  if (isDefensiveAnalysis && !harmfulFacilitationRequested) {
    return {
      result: "allow_defensive_analysis",
      harmfulFacilitationRequested: false,
      isDefensiveAnalysis: true,
      criteriaApplied: ["consent_and_harm", "defensive_exception"],
      rationale:
        "Parece análisis, denuncia o documentación defensiva. Se permite; no se facilitan métodos de daño.",
      safeAlternative: null,
      uncertainties: [
        "La clasificación es heurística; el modelo debe seguir separando hechos de inferencias.",
      ],
    };
  }

  if (harmfulFacilitationRequested) {
    return {
      result: "stop_and_redirect",
      harmfulFacilitationRequested: true,
      isDefensiveAnalysis: false,
      criteriaApplied: ["potential_harm", "exploitation", "no_facilitation"],
      rationale:
        "La petición parece solicitar instrucciones que facilitarían abuso, coacción o encubrimiento.",
      safeAlternative:
        "Puedo ayudar a prevenir el daño, proteger a la persona afectada, conservar pruebas de forma segura o preparar una denuncia. No daré pasos operativos para cometer o ocultar el daño.",
      uncertainties: [
        "Heurística por patrones de texto; no es un juicio moral absoluto ni un veredicto legal.",
      ],
    };
  }

  return {
    result: "no_clear_harmful_request",
    harmfulFacilitationRequested: false,
    isDefensiveAnalysis,
    criteriaApplied: ["no_explicit_facilitation"],
    rationale:
      "No se detectó petición explícita de facilitación de daño en las reglas actuales. Eso no equivale a aprobación moral del contenido.",
    safeAlternative: null,
    uncertainties: [
      "Pueden existir daños no cubiertos por las reglas. Ante duda, prioriza no facilitar daño.",
    ],
  };
}
