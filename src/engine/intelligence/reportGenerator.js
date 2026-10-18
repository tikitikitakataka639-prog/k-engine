/**
 * reportGenerator.js
 * Denuncias con contador determinista de caracteres (code points).
 * No inventa artículos legales.
 */

import { cleanText } from "./evidenceAnalyzer.js";

export const PLATFORM_LIMITS = {
  tiktok: { legal: 400, description: 1000 },
  instagram: { legal: 500, description: 1000 },
  youtube: { legal: 500, description: 2000 },
  x: { legal: 280, description: 1000 },
  generic: { legal: 500, description: 1500 },
};

/** Conteo real por code points Unicode. */
export function charCount(text) {
  return Array.from(String(text || "")).length;
}

export function fitToLimit(text, limit) {
  const t = String(text || "");
  const limitN = Math.max(1, Number(limit) || 400);
  const points = Array.from(t);
  if (points.length <= limitN) {
    return { text: t, length: points.length, limit: limitN, over: false, truncated: false };
  }
  let cut = points.slice(0, limitN).join("");
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > limitN * 0.6) cut = cut.slice(0, lastSpace);
  cut = cut.trimEnd();
  return {
    text: cut,
    length: Array.from(cut).length,
    limit: limitN,
    over: true,
    truncated: true,
  };
}

/**
 * Genera borrador de denuncia.
 */
export function generateReport(opts = {}) {
  const platform = cleanText(opts.platform || "generic").toLowerCase() || "generic";
  const limits = PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.generic;
  const maxLegal = Number.isInteger(opts.maxLegal) ? opts.maxLegal : limits.legal;
  const maxDesc = Number.isInteger(opts.maxDescription) ? opts.maxDescription : limits.description;

  const facts = cleanText(opts.facts || opts.observed || "");
  const evidence = cleanText(opts.evidence || "");
  const jurisdiction = cleanText(opts.jurisdiction || "");
  const category = cleanText(opts.category || "");
  const law = cleanText(opts.law || "");

  const lawVerified = Boolean(law);
  const lawNote = lawVerified
    ? `Referencia aportada por el usuario: ${law}. Debe verificarse antes de presentarla como vigente.`
    : "Sin referencia legal verificada en esta sesión. No se inventan artículos.";

  const legalRaw = [
    category ? `Categoría señalada: ${category}.` : "Solicitud de revisión de contenido.",
    lawNote,
    jurisdiction ? `Jurisdicción indicada: ${jurisdiction}.` : "",
    "Se solicita revisión conforme a las políticas de la plataforma.",
  ]
    .filter(Boolean)
    .join(" ");

  const descParts = [];
  if (facts) descParts.push(`Hechos observados: ${facts}`);
  if (evidence) descParts.push(`Evidencia disponible: ${evidence}`);
  descParts.push(
    "Interpretación: los hechos anteriores se aportan para revisión; no constituyen por sí solos un veredicto."
  );
  descParts.push("Petición: revisión del material y aplicación de las medidas que correspondan.");
  const descRaw = descParts.join("\n");

  const legal = fitToLimit(legalRaw, maxLegal);
  const description = fitToLimit(descRaw, maxDesc);

  const insufficientEvidence = !facts && !evidence;

  return {
    platform,
    jurisdiction: jurisdiction || null,
    category: category || null,
    law: law || null,
    lawVerified,
    legal: {
      text: legal.text,
      chars: legal.length,
      limit: legal.limit,
      withinLimit: legal.length <= legal.limit,
      truncated: legal.truncated,
    },
    description: {
      text: description.text,
      chars: description.length,
      limit: description.limit,
      withinLimit: description.length <= description.limit,
      truncated: description.truncated,
    },
    insufficientEvidence,
    disclaimer:
      "Borrador para revisión humana. No inventa delitos penales. Los hechos deben poder acreditarse. Las referencias legales no verificadas no deben presentarse como certezas.",
    countMethod: "Unicode code points; plataformas pueden contar emoji/URL de forma distinta.",
  };
}
