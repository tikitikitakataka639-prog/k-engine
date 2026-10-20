/**
 * outputGuard.js — post-proceso de salida de SLM.
 * - Anti-bucles
 * - Anti-plantillas corporativas
 * - Math verificado manda sobre el modelo
 * - Fidelidad al caso (nombres inventados, pruebas no verificadas como hechos)
 */

import { applyCaseFidelityGuard } from "./evidenceFidelity.js";

const CORPORATE_RE =
  /lo siento,?\s*pero\s+no\s+puedo|como\s+ia\s+no\s+(puedo|debo)|no\s+puedo\s+(proporcionar|ayudar|asistir|ofrecer)|asistencia\s+para\s+(abuso|violencia)|no\s+estoy\s+autorizad[oa]|te\s+recomiendo\s+contactar\s+con\s+(un\s+)?(profesional|organizaci)|necesitas un momento para calmarte|estoy aqu[ií] para escucharte|hablar un poco antes de abordar/i;

export function detectRepetitionLoop(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 3) {
    const last = lines[lines.length - 1];
    const same = lines.filter((l) => l === last).length;
    if (same >= 3 && last.length >= 2) return true;
  }
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 3) {
    const last = tokens[tokens.length - 1];
    const same = tokens.filter((x) => x === last).length;
    if (same >= 3 && last.length >= 2) return true;
  }
  if (t.length >= 18) {
    const m = t.match(/(.{6,80}?)\1\1/s);
    if (m) return true;
  }
  return false;
}

export function collapseRepetition(text) {
  let t = String(text || "").trim();
  if (!t) return t;
  const lines = t.split("\n").map((l) => l.trimEnd());
  if (lines.length >= 2) {
    const last = lines[lines.length - 1].trim();
    let i = lines.length - 1;
    while (i > 0 && lines[i].trim() === last) i--;
    if (lines.length - 1 - i >= 2) {
      t = lines.slice(0, i + 1).concat(last).join("\n").trim();
    }
  }
  t = t.replace(/(\b[\w.:]+\b)(?:\s+\1){2,}/g, "$1");
  t = t.replace(/(.{6,80}?)(\1){2,}/gs, "$1");
  return t.trim();
}

export function isCorporateRefusal(text) {
  return CORPORATE_RE.test(String(text || ""));
}

export function modelAgreesWithMath(text, mathData) {
  if (!mathData || !text) return false;
  const t = String(text);
  if (mathData.kind === "schedule" && mathData.end) {
    const end = String(mathData.end);
    const alt = end.replace(":", ".");
    if (t.includes(end) || t.includes(alt)) return true;
    return false;
  }
  if (mathData.kind === "arithmetic" || mathData.kind === "percent") {
    if (mathData.result == null || !Number.isFinite(mathData.result)) return false;
    const r = mathData.result;
    if (Number.isInteger(r)) {
      return new RegExp(`(?<![\\d.])${r}(?![\\d])`).test(t);
    }
    const s = String(r);
    return t.includes(s) || t.includes(s.replace(".", ","));
  }
  return false;
}

export function formatVerifiedMathAnswer(mathData) {
  if (!mathData) return "";
  if (mathData.kind === "schedule") {
    const mins = Array.isArray(mathData.minutes) ? mathData.minutes.join(" + ") : "";
    return (
      `Duración total: ${mathData.totalMinutes} minutos` +
      (mins ? ` (${mins})` : "") +
      `. Empiezas a las ${mathData.start} y terminas a las ${mathData.end}.`
    );
  }
  if (mathData.kind === "arithmetic") {
    return mathData.summary || `${mathData.expression} = ${mathData.result}.`;
  }
  if (mathData.kind === "percent") {
    return mathData.summary || `${mathData.pct}% de ${mathData.base} = ${mathData.result}.`;
  }
  return mathData.summary || "";
}

export function guardAssistantOutput(raw, userText, opts = {}) {
  let t = String(raw || "").trim();

  if (!t) {
    if (opts.mathHit && opts.mathData) {
      return formatVerifiedMathAnswer(opts.mathData);
    }
    return t;
  }

  if (detectRepetitionLoop(t)) {
    t = collapseRepetition(t);
  }

  if (opts.mathHit && opts.mathData) {
    if (!modelAgreesWithMath(t, opts.mathData)) {
      return formatVerifiedMathAnswer(opts.mathData);
    }
    return t;
  }

  if (isCorporateRefusal(t)) {
    const u = String(userText || "").trim().toLowerCase();
    if (!u || /^(hola|hey|buenas|hello|hi|saludos|qué tal|que tal)\b/.test(u) || u.length < 48) {
      if (/^(hola|hey|buenas|hello|hi|saludos)\b/.test(u)) return "Hola. ¿Qué necesitas?";
      return "Vale. Dime qué necesitas y vamos al grano.";
    }
    if (/ley|artículo|art\.?\s*\d+|grooming|denuncia|menor|protección|acoso|código penal|183/.test(u)) {
      return (
        "Eso es información legítima, no ayuda a delinquir. " +
        "Resume tu pregunta concreta y te respondo con hechos."
      );
    }
    return "Reformulo: dime en una frase qué necesitas (análisis, cálculo, código, denuncia) y lo trato.";
  }

  if (!opts.skipFidelity && userText) {
    const fid = applyCaseFidelityGuard(t, userText);
    t = fid.text;
  }

  if (opts.mathSummary && !/\d/.test(t)) {
    t = t + (t.endsWith(".") ? " " : ". ") + opts.mathSummary;
  }

  return t;
}

export {
  validateCaseFidelity,
  applyCaseFidelityGuard,
  findInventedNames,
} from "./evidenceFidelity.js";
