/**
 * outputValidator.js
 * Validación determinista de estructura de assessments y denuncias.
 */

const RISK_LEVELS = new Set([
  "urgent_review",
  "review",
  "insufficient_evidence",
  "no_explicit_signal",
]);

export function validateAssessment(assessment) {
  if (!assessment || typeof assessment !== "object") {
    return { valid: false, errors: ["assessment must be an object"] };
  }
  const errors = [];
  if (!Array.isArray(assessment.observedFacts)) errors.push("observedFacts must be an array");
  if (!Array.isArray(assessment.riskIndicators) && !Array.isArray(assessment.inferences)) {
    errors.push("riskIndicators (or inferences) must be an array");
  }
  if (!Array.isArray(assessment.missingEvidence) && !Array.isArray(assessment.unknowns)) {
    errors.push("missingEvidence (or unknowns) must be an array");
  }
  const level = assessment.riskLevel;
  if (level != null && !RISK_LEVELS.has(level)) {
    errors.push("riskLevel is not recognized");
  }
  if (typeof assessment.humanReviewRequired !== "boolean") {
    errors.push("humanReviewRequired must be boolean");
  }
  return { valid: errors.length === 0, errors };
}

export function validateReport(report) {
  if (!report || typeof report !== "object") {
    return { valid: false, errors: ["report must be an object"] };
  }
  const errors = [];
  if (!report.legal || typeof report.legal.chars !== "number") {
    errors.push("legal.chars missing");
  } else if (report.legal.chars > report.legal.limit) {
    errors.push("legal exceeds limit");
  }
  if (!report.description || typeof report.description.chars !== "number") {
    errors.push("description.chars missing");
  } else if (report.description.chars > report.description.limit) {
    errors.push("description exceeds limit");
  }
  if (report.insufficientEvidence) {
    errors.push("insufficient_evidence_for_report");
  }
  return { valid: errors.length === 0, errors };
}

export function detectUnsupportedCertainty(text, hasEvidence) {
  const t = String(text || "");
  if (hasEvidence) return false;
  return /\b(es un delincuente|es un depredador|es culpable|cometi[oó] el delito|sin duda es peligroso)\b/i.test(
    t
  );
}
