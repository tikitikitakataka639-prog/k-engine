/**
 * evidenceAnalyzer.js
 * Estructura determinista de evidencias. No declara culpabilidad ni identidad.
 */

const SIGNALS = [
  {
    id: "explicit_violence",
    label: "amenaza explícita de violencia",
    level: "urgent_review",
    re: /\b(te voy a matar|voy a matarte|te voy a disparar|voy a apuñalarte|os voy a matar|voy a hacer una masacre|i will kill you|i am going to shoot you)\b/i,
  },
  {
    id: "sexual_minor_exploitation",
    label: "posible explotación sexual de menores",
    level: "urgent_review",
    re: /\b(grooming|pornograf[ií]a infantil|material de abuso sexual infantil|explotaci[oó]n sexual de menores|menor(?:es)? de \d{1,2} años.{0,50}(?:sexo|sexual)|sexual.{0,50}menor(?:es)? de \d{1,2} años)\b/i,
  },
  {
    id: "coercion_or_blackmail",
    label: "posible coacción o extorsión",
    level: "review",
    re: /\b(te voy a extorsionar|paga o publico|si no pagas.{0,40}(publico|difundo)|chantaje|amenaza con publicar tus fotos|sextorsi[oó]n)\b/i,
  },
  {
    id: "targeted_harassment",
    label: "posible acoso dirigido",
    level: "review",
    re: /\b(te voy a acosar|no te voy a dejar en paz|voy a perseguirte|doxxe?ar(?:te)?|publicar[eé] tu direcci[oó]n)\b/i,
  },
  {
    id: "radical_violence_call",
    label: "posible llamada a violencia organizada",
    level: "review",
    re: /\b(hay que matarlos a todos|hay que bombear|ataque terrorista|montar un atentado)\b/i,
  },
];

const AMBIGUITY_HINTS =
  /\b(es una broma|estoy de broma|citando|según el libro|en la película|hipot[eé]tico|roleplay|ficci[oó]n)\b/i;

export function cleanText(value, max = 20000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function analyzeEvidence(input, meta = {}) {
  const text = cleanText(input);
  const source = cleanText(meta.source || "", 200);
  const date = cleanText(meta.date || "", 40);

  const indicators = SIGNALS.filter((s) => s.re.test(text)).map(({ id, label, level }) => ({
    id,
    label,
    level,
  }));

  const ambiguous = AMBIGUITY_HINTS.test(text);
  let riskLevel = "no_explicit_signal";
  if (indicators.some((s) => s.level === "urgent_review")) riskLevel = "urgent_review";
  else if (indicators.length) riskLevel = "review";
  if (ambiguous && riskLevel === "review") riskLevel = "insufficient_evidence";

  const observedFacts = [];
  if (text) observedFacts.push({ type: "text_provided", detail: "Se aportó texto para análisis." });
  for (const ind of indicators) {
    observedFacts.push({
      type: "keyword_match",
      detail: `Coincidencia heurística: ${ind.label}`,
      signalId: ind.id,
    });
  }

  const alternativeExplanations = [];
  if (ambiguous) {
    alternativeExplanations.push("Posible broma, cita, ficción o contexto hipotético.");
  }
  if (indicators.length) {
    alternativeExplanations.push(
      "Podría ser denuncia de terceros, cita de amenaza recibida o copia de contenido ajeno."
    );
  }
  if (!indicators.length && text) {
    alternativeExplanations.push("Sin patrones explícitos de las reglas actuales; el silencio no prueba seguridad.");
  }

  const missingEvidence = [
    "Conversación completa y turnos previos",
    "Fecha, plataforma y URL/fuente verificable",
    "Confirmación de que el texto no es cita, broma o negación",
  ];
  if (!source) missingEvidence.push("Fuente del material");
  if (!date) missingEvidence.push("Fecha del material");

  let recommendedAction = "Ninguna actuación automática. Continúa el análisis si el usuario aporta contexto.";
  if (riskLevel === "urgent_review") {
    recommendedAction =
      "Revisión humana prioritaria. Conservar pruebas de forma segura. No facilitar la conducta descrita.";
  } else if (riskLevel === "review") {
    recommendedAction = "Revisión humana contextual. Separar hechos de inferencias antes de cualquier conclusión.";
  }

  return {
    observedFacts,
    sourceContext: { source: source || null, date: date || null, textLength: text.length },
    riskIndicators: indicators,
    alternativeExplanations,
    missingEvidence,
    riskLevel,
    confidence: indicators.length
      ? ambiguous
        ? "low_keyword_with_ambiguity"
        : "keyword_match_requires_context"
      : "no_matching_rule",
    recommendedAction,
    humanReviewRequired: indicators.length > 0 && !ambiguous,
    limitations: [
      "La coincidencia textual no demuestra intención, autoría ni delito.",
      "No infieras peligrosidad por identidad, apariencia, ideología, emojis o una publicación aislada.",
      "Un emoji o una opinión impopular no son prueba de amenaza.",
    ],
  };
}

export function analyzeProfileEvidence(items) {
  const entries = (Array.isArray(items) ? items : []).filter(
    (item) => item && typeof item.text === "string"
  );
  const analyses = entries.map((item, index) => ({
    index,
    source: cleanText(item.source || ""),
    date: cleanText(item.date || ""),
    analysis: analyzeEvidence(item.text, { source: item.source, date: item.date }),
  }));

  const bySignal = new Map();
  for (const entry of analyses) {
    for (const signal of entry.analysis.riskIndicators) {
      const cur = bySignal.get(signal.id) || { ...signal, occurrences: 0, entries: [] };
      cur.occurrences += 1;
      cur.entries.push(entry.index);
      bySignal.set(signal.id, cur);
    }
  }
  const signals = [...bySignal.values()];
  const level = signals.some((s) => s.level === "urgent_review")
    ? "urgent_review"
    : signals.length
      ? "review"
      : "insufficient_evidence";

  return {
    itemsReviewed: entries.length,
    signals,
    riskLevel: level,
    conclusion: signals.length
      ? "Fragmentos que merecen revisión contextual; no permiten por sí solos concluir que el titular del perfil sea peligroso o culpable."
      : "Sin patrones explícitos en el material aportado. Eso no demuestra que el perfil sea seguro.",
    humanReviewRequired: signals.length > 0,
  };
}

export { SIGNALS };
