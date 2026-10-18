/**
 * KERNEL Intelligence Core — deterministic helpers shared by every model.
 * Heuristics flag text for review; they do not establish identity, intent, guilt or dangerousness.
 */

const SIGNALS = [
  { id: "explicit_violence", label: "amenaza explícita de violencia", level: "urgent_review",
    re: /\b(te voy a matar|voy a matarte|te voy a disparar|voy a apuñalarte|os voy a matar|voy a hacer una masacre|i will kill you|i am going to shoot you)\b/i },
  { id: "sexual_minor_exploitation", label: "posible explotación sexual de menores", level: "urgent_review",
    re: /\b(grooming|pornograf[ií]a infantil|material de abuso sexual infantil|explotaci[oó]n sexual de menores|menor(?:es)? de \d{1,2} años.{0,50}(?:sexo|sexual)|sexual.{0,50}menor(?:es)? de \d{1,2} años)\b/i },
  { id: "coercion_or_blackmail", label: "posible coacción o extorsión", level: "review",
    re: /\b(te voy a extorsionar|paga o publico|si no pagas.{0,40}(publico|difundo)|chantaje|amenaza con publicar tus fotos|sextorsi[oó]n)\b/i },
  { id: "targeted_harassment", label: "posible acoso dirigido", level: "review",
    re: /\b(te voy a acosar|no te voy a dejar en paz|voy a perseguirte|doxxe?ar(?:te)?|publicar[eé] tu direcci[oó]n)\b/i },
];

const HARMFUL_REQUEST = /\b(c[oó]mo (?:puedo|hacer para) (?:abusar|chantajear|extorsionar|acosar|amenazar|evadir a la polic[ií]a)|ay[uú]dame a (?:abusar|extorsionar|acosar|amenazar|ocultar pruebas)|c[oó]mo ocultar pruebas de (?:un delito|abuso|agresi[oó]n)|crear (?:pornograf[ií]a infantil|material sexual de menores))\b/i;

function cleanText(value) {
  return typeof value === "string" ? value.trim().slice(0, 20000) : "";
}

/** Categorize observable text indicators without assigning a label to a person. */
export function analyzeEvidence(input) {
  const text = cleanText(input);
  const indicators = SIGNALS.filter((s) => s.re.test(text)).map(({ id, label, level }) => ({ id, label, level }));
  const level = indicators.some((s) => s.level === "urgent_review")
    ? "urgent_review"
    : indicators.length ? "review" : "no_explicit_signal";
  return {
    observedTextProvided: Boolean(text),
    indicators,
    level,
    confidence: indicators.length ? "keyword_match_requires_context" : "no_matching_rule",
    limitations: [
      "La coincidencia textual no demuestra intención, autoría ni delito.",
      "Comprueba conversación completa, fecha, fuente y posibles citas, bromas o negaciones.",
      "No infieras peligrosidad por identidad, apariencia, ideología, emojis o una publicación ambigua.",
    ],
    humanReviewRequired: indicators.length > 0,
  };
}

/** Evaluate a directly stated request, not a person's moral worth or identity. */
export function evaluateMoralAction(input) {
  const text = cleanText(input);
  const harmfulFacilitationRequested = HARMFUL_REQUEST.test(text);
  return {
    result: harmfulFacilitationRequested ? "stop_and_redirect" : "no_clear_harmful_request",
    harmfulFacilitationRequested,
    rationale: harmfulFacilitationRequested
      ? "La petición parece solicitar instrucciones que facilitarían abuso, coacción o encubrimiento."
      : "No se ha detectado una petición explícita incluida en las reglas; esto no equivale a una aprobación moral.",
    safeAlternative: harmfulFacilitationRequested
      ? "Puedo ayudar a prevenir el daño, proteger a la persona afectada, conservar pruebas de forma segura o preparar una denuncia."
      : null,
  };
}

/** Build a compact, model-agnostic system addition. */
export function buildIntelligenceContext(input) {
  const text = cleanText(input);
  const evidence = analyzeEvidence(text);
  const moral = evaluateMoralAction(text);
  const lines = [
    "KERNEL INTELLIGENCE CORE:",
    "Prioriza hechos verificables. Separa observación, inferencia e hipótesis; cita qué fragmento respalda cada conclusión.",
    "No diagnostiques ni declares a una persona peligrosa o culpable por señales ambiguas. No uses identidad o apariencia como indicador.",
    "Las reglas automáticas son avisos para revisión, no veredictos. Considera citas, ironía, negación, contexto, repetición y fuente.",
    "Si faltan datos, dilo. En denuncias, no inventes leyes, pruebas, intenciones ni límites de plataforma.",
  ];
  if (evidence.indicators.length) {
    lines.push("AVISO HEURÍSTICO (no es una conclusión): " + evidence.indicators.map((s) => s.label).join("; ") + ".");
    lines.push("Revisa el contexto completo y explica qué está probado y qué no. Nivel orientativo: " + evidence.level + ".");
  }
  if (moral.harmfulFacilitationRequested) {
    lines.push("REVISIÓN MORAL: no proporciones instrucciones operativas que faciliten el daño indicado. Ofrece prevención, protección o documentación segura.");
  }
  return lines.join("\n");
}

/** Create a report draft with deterministic per-field Unicode code-point counts. */
export function generateReport({ facts = "", platform = "", jurisdiction = "", law = "", maxChars = 1000 } = {}) {
  const text = cleanText(facts);
  const limit = Number.isInteger(maxChars) && maxChars >= 0 ? maxChars : 1000;
  const points = Array.from(text);
  const draft = points.length <= limit ? text : points.slice(0, limit).join("");
  const count = Array.from(draft).length;
  return {
    text: draft,
    platform: cleanText(platform),
    jurisdiction: cleanText(jurisdiction),
    law: cleanText(law),
    characterCount: count,
    maxChars: limit,
    withinLimit: count <= limit,
    truncated: points.length > limit,
    countMethod: "Unicode code points; platform-specific counting may differ for emoji and URLs.",
  };
}


/** Aggregate public post/comment evidence; never infer a person's identity or guilt. */
export function analyzeProfileEvidence(items) {
  const entries = (Array.isArray(items) ? items : []).filter((item) => item && typeof item.text === "string");
  const analyses = entries.map((item, index) => ({
    index,
    source: cleanText(item.source || ""),
    date: cleanText(item.date || ""),
    analysis: analyzeEvidence(item.text),
  }));
  const bySignal = new Map();
  for (const entry of analyses) {
    for (const signal of entry.analysis.indicators) {
      const current = bySignal.get(signal.id) || { ...signal, occurrences: 0, entries: [] };
      current.occurrences += 1;
      current.entries.push(entry.index);
      bySignal.set(signal.id, current);
    }
  }
  const signals = [...bySignal.values()];
  const level = signals.some((s) => s.level === "urgent_review")
    ? "urgent_review"
    : signals.length ? "review" : "insufficient_evidence";
  return {
    itemsReviewed: entries.length,
    signals,
    level,
    conclusion: signals.length
      ? "Se han encontrado fragmentos que merecen revisión contextual; no permiten por sí solos concluir que el titular del perfil sea peligroso o culpable."
      : "Con el material aportado no se han detectado estos patrones explícitos. Esto no demuestra que el perfil sea seguro.",
    humanReviewRequired: signals.length > 0,
  };
}

export function validateAssessment(assessment) {
  if (!assessment || typeof assessment !== "object") return { valid: false, errors: ["assessment must be an object"] };
  const errors = [];
  if (!Array.isArray(assessment.observedFacts)) errors.push("observedFacts must be an array");
  if (!Array.isArray(assessment.inferences)) errors.push("inferences must be an array");
  if (!Array.isArray(assessment.unknowns)) errors.push("unknowns must be an array");
  if (!["urgent_review", "review", "insufficient_evidence", "no_explicit_signal"].includes(assessment.riskLevel)) errors.push("riskLevel is not recognized");
  if (typeof assessment.humanReviewRequired !== "boolean") errors.push("humanReviewRequired must be boolean");
  return { valid: errors.length === 0, errors };
}
