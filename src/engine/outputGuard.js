/**
 * outputGuard.js — post-proceso de salida de SLM.
 */

const CORPORATE_RE =
  /lo siento,?\s*pero\s+no\s+puedo|como\s+ia\s+no\s+(puedo|debo)|no\s+puedo\s+(proporcionar|ayudar|asistir|ofrecer)|asistencia\s+para\s+(abuso|violencia)|no\s+estoy\s+autorizad[oa]|te\s+recomiendo\s+contactar\s+con\s+(un\s+)?(profesional|organizaci)|necesitas un momento para calmarte|estoy aqu[ií] para escucharte|hablar un poco antes de abordar/i;

export function detectRepetitionLoop(text) {
  const t = String(text || "").trim();
  if (t.length < 40) return false;
  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 3) {
    const last = lines[lines.length - 1];
    const same = lines.filter((l) => l === last).length;
    if (same >= 3 && last.length > 8) return true;
  }
  const m = t.match(/(.{12,80}?)\1\1/s);
  return Boolean(m);
}

export function collapseRepetition(text) {
  let t = String(text || "").trim();
  if (!t) return t;
  const lines = t.split("\n");
  if (lines.length >= 3) {
    const last = lines[lines.length - 1].trim();
    let i = lines.length - 1;
    while (i > 0 && lines[i].trim() === last) i--;
    if (lines.length - 1 - i >= 2) {
      t = lines.slice(0, i + 2).join("\n").trim();
    }
  }
  t = t.replace(/(.{12,80}?)(\1){2,}/gs, "$1$1");
  return t.trim();
}

export function isCorporateRefusal(text) {
  return CORPORATE_RE.test(String(text || ""));
}

export function guardAssistantOutput(raw, userText, opts = {}) {
  let t = String(raw || "").trim();
  if (!t) return t;

  if (detectRepetitionLoop(t)) {
    t = collapseRepetition(t);
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

  if (opts.mathSummary && !/\d/.test(t)) {
    t = t + (t.endsWith(".") ? " " : ". ") + opts.mathSummary;
  }

  return t;
}
