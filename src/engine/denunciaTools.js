/**
 * Módulo de denuncias / reportes para plataformas sociales.
 * Contador de caracteres REAL (incluye espacios y puntuación).
 * Límites configurables; no son universales de TikTok — son defaults editables.
 */

const STORAGE_KEY = "kengine_denuncia_limits";

/** Defaults (editables). TikTok: fundamentación ~400, descripción ~1000 como referencia de formulario. */
export const DEFAULT_LIMITS = {
  tiktok: { legal: 400, description: 1000 },
  instagram: { legal: 500, description: 1000 },
  youtube: { legal: 500, description: 2000 },
  x: { legal: 280, description: 1000 },
  generic: { legal: 500, description: 1500 },
};

export function loadLimits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LIMITS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_LIMITS, ...parsed };
  } catch {
    return { ...DEFAULT_LIMITS };
  }
}

export function saveLimits(limits) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limits));
  } catch {
    /* quota / private mode */
  }
}

/** Longitud real del string (JS: code units; suficiente para contadores de formulario web). */
export function charCount(text) {
  return String(text || "").length;
}

/**
 * Recorta al límite sin cortar a mitad de palabra si es posible.
 * @returns {{ text: string, length: number, limit: number, over: boolean }}
 */
export function fitToLimit(text, limit) {
  const t = String(text || "");
  const limitN = Math.max(1, Number(limit) || 400);
  if (t.length <= limitN) {
    return { text: t, length: t.length, limit: limitN, over: false };
  }
  let cut = t.slice(0, limitN);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > limitN * 0.6) cut = cut.slice(0, lastSpace);
  cut = cut.trimEnd();
  return { text: cut, length: cut.length, limit: limitN, over: true };
}

/**
 * Plantilla de denuncia objetiva.
 * @param {object} opts
 * @param {string} opts.platform
 * @param {string} opts.observed — hechos observados
 * @param {string} [opts.context]
 * @param {string} [opts.norm] — norma de plataforma sospechada
 * @param {string} [opts.evidence]
 */
export function buildDenunciaDraft(opts) {
  const platform = (opts.platform || "generic").toLowerCase();
  const limits = loadLimits();
  const lim = limits[platform] || limits.generic;

  const observed = String(opts.observed || "").trim();
  const context = String(opts.context || "").trim();
  const norm = String(opts.norm || "").trim();
  const evidence = String(opts.evidence || "").trim();

  const legalRaw = [
    norm ? `Posible incumplimiento: ${norm}.` : "Posible incumplimiento de las normas de la comunidad.",
    "Se solicita revisión conforme a las políticas de la plataforma.",
  ].join(" ");

  const descParts = [];
  if (observed) descParts.push(`Hecho observado: ${observed}`);
  if (context) descParts.push(`Contexto: ${context}`);
  if (evidence) descParts.push(`Evidencia disponible: ${evidence}`);
  descParts.push("Solicitud: revisión del contenido y aplicación de las medidas que correspondan.");
  const descRaw = descParts.join("\n");

  const legal = fitToLimit(legalRaw, lim.legal);
  const description = fitToLimit(descRaw, lim.description);

  return {
    platform,
    limits: lim,
    legal: {
      text: legal.text,
      chars: legal.length,
      limit: legal.limit,
      over: legal.over,
    },
    description: {
      text: description.text,
      chars: description.length,
      limit: description.limit,
      over: description.over,
    },
    disclaimer:
      "Esto es un borrador. No inventa delitos penales. Los hechos deben coincidir con lo que el usuario pueda acreditar.",
  };
}

/** Prompt de sistema corto para que el LLM redacte denuncia (inyectable). */
export function denunciaSystemHint(platform, legalLimit, descLimit) {
  return (
    `Redacta una denuncia para ${platform}. ` +
    `Campo legal ≤ ${legalLimit} caracteres; descripción ≤ ${descLimit} caracteres. ` +
    `Solo hechos observables e interpretación etiquetada como tal. Sin inventar artículos penales ni pruebas. ` +
    `Devuelve dos bloques etiquetados: LEGAL: y DESCRIPCION:`
  );
}
