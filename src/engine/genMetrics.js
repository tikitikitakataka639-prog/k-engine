/**
 * genMetrics.js — cálculo determinista de métricas de generación.
 * No inventa valores: si faltan datos, devuelve null.
 */

/**
 * @param {{ completionTokens?: number|null, genMs?: number|null, firstTokenMs?: number|null }} input
 * @returns {{
 *   tokens: number|null,
 *   genMs: number|null,
 *   firstTokenMs: number|null,
 *   overallTps: number|null,
 *   decodeTps: number|null,
 * }}
 */
export function computeGenMetrics(input = {}) {
  const tokens =
    Number.isFinite(Number(input.completionTokens)) && Number(input.completionTokens) > 0
      ? Math.floor(Number(input.completionTokens))
      : null;
  const genMs =
    Number.isFinite(Number(input.genMs)) && Number(input.genMs) >= 0
      ? Number(input.genMs)
      : null;
  const firstTokenMs =
    Number.isFinite(Number(input.firstTokenMs)) && Number(input.firstTokenMs) >= 0
      ? Number(input.firstTokenMs)
      : null;

  let overallTps = null;
  if (tokens != null && genMs != null && genMs > 0) {
    overallTps = +(tokens / (genMs / 1000)).toFixed(1);
  }

  // Velocidad de decodificación: excluye TTFT cuando hay ≥2 tokens.
  let decodeTps = null;
  if (tokens != null && genMs != null && firstTokenMs != null && tokens >= 2) {
    const decodeMs = genMs - firstTokenMs;
    if (decodeMs > 0) {
      decodeTps = +((tokens - 1) / (decodeMs / 1000)).toFixed(1);
    }
  } else if (overallTps != null && (firstTokenMs == null || tokens === 1)) {
    decodeTps = overallTps;
  }

  return { tokens, genMs, firstTokenMs, overallTps, decodeTps };
}

/**
 * Formatea métricas para la UI del lab.
 * Preferimos decodeTps para "TOKENS / SECOND" (velocidad real de generación).
 */
export function formatMetricsForUi(m) {
  const src = computeGenMetrics(m);
  return {
    tokens: src.tokens != null ? String(src.tokens) : "N/A",
    tps: src.decodeTps != null ? String(src.decodeTps) : src.overallTps != null ? String(src.overallTps) : "N/A",
    genTime: src.genMs != null ? (src.genMs / 1000).toFixed(1) + " s" : "N/A",
    firstTok: src.firstTokenMs != null ? Math.round(src.firstTokenMs) + " ms" : "N/A",
    overallTps: src.overallTps,
    decodeTps: src.decodeTps,
  };
}
