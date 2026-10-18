/**
 * mathTools.js — cálculo determinista para SLM (0.5B / 1B).
 * NO ejecuta código del modelo. Solo analiza el texto del usuario con
 * patrones restringidos y funciones explícitas (aritmética, tiempo, %).
 */

const MAX_NUM = 1e12;
const MIN_NUM = -1e12;

function clampNum(n) {
  if (!Number.isFinite(n)) return null;
  if (n > MAX_NUM || n < MIN_NUM) return null;
  return n;
}

function parseEsNumber(raw) {
  let s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return clampNum(Number(s));
}

/** Evalúa expresión aritmética segura: solo dígitos, + - * / ( ) . y espacios. */
export function evalSafeArithmetic(expr) {
  const cleaned = String(expr || "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");
  if (!cleaned || cleaned.length > 80) return null;
  if (!/^[\d+\-*/().]+$/.test(cleaned)) return null;
  if (/\*\*|\/\/|\+\+|\-\-/.test(cleaned)) return null;
  let depth = 0;
  for (const ch of cleaned) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth < 0) return null;
  }
  if (depth !== 0) return null;
  try {
    const fn = new Function(`"use strict"; return (${cleaned});`);
    const v = fn();
    return clampNum(typeof v === "number" ? v : null);
  } catch {
    return null;
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Suma minutos a HH:MM (24h). */
export function addMinutesToTime(hh, mm, addMin) {
  if (![hh, mm, addMin].every((x) => Number.isFinite(x))) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  if (Math.abs(addMin) > 60 * 24 * 14) return null;
  let total = hh * 60 + mm + Math.round(addMin);
  total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return { hh: h, mm: m, text: `${pad2(h)}:${pad2(m)}` };
}

export function solveDurationSchedule(text) {
  const t = String(text || "");
  const timeM = t.match(/\b(?:a\s+las\s+|empiezo\s+a\s+las\s+|inicio\s+a\s+las\s+|desde\s+las\s+)?(\d{1,2}):(\d{2})\b/i);
  if (!timeM) return null;
  const startH = Number(timeM[1]);
  const startM = Number(timeM[2]);
  if (startH > 23 || startM > 59) return null;

  const mins = [];
  const reList = /(\d+)\s*(?:min(?:utos?)?|m\b)/gi;
  let m;
  while ((m = reList.exec(t)) !== null) {
    const n = Number(m[1]);
    if (n > 0 && n < 24 * 60) mins.push(n);
  }
  const block = t.match(/(\d+(?:\s*[,y]\s*\d+)+)\s*min/i);
  if (block) {
    const parts = block[1].split(/\s*[,y]\s*/).map((x) => Number(x.trim())).filter((n) => n > 0 && n < 24 * 60);
    for (const p of parts) {
      if (!mins.includes(p)) mins.push(p);
    }
  }
  if (mins.length === 0) return null;

  const total = mins.reduce((a, b) => a + b, 0);
  const end = addMinutesToTime(startH, startM, total);
  if (!end) return null;
  return {
    kind: "schedule",
    minutes: mins,
    totalMinutes: total,
    start: `${pad2(startH)}:${pad2(startM)}`,
    end: end.text,
    summary: `Duración total: ${total} minutos (${mins.join(" + ")}). Inicio ${pad2(startH)}:${pad2(startM)} → fin ${end.text}.`,
  };
}

export function solvePercent(text) {
  const t = String(text || "").toLowerCase();
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de|del)\s*(\d+(?:[.,]\d+)?)/);
  if (!m) m = t.match(/(?:el\s+)?(\d+(?:[.,]\d+)?)\s*(?:por\s*ciento|%)\s*(?:de|del)\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const pct = parseEsNumber(m[1]);
  const base = parseEsNumber(m[2]);
  if (pct == null || base == null) return null;
  const result = clampNum((pct / 100) * base);
  if (result == null) return null;
  return {
    kind: "percent",
    pct,
    base,
    result,
    summary: `${pct}% de ${base} = ${formatNum(result)}.`,
  };
}

function formatNum(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  const r = Math.round(n * 1e6) / 1e6;
  return String(r);
}

export function solveDirectArithmetic(text) {
  const t = String(text || "");
  const m = t.match(
    /(?:cu[aá]nto\s+es|calcula|resuelve|resultado\s+de|=)\s*([\d\s+\-*/().×÷,]+)/i
  );
  if (m) {
    const v = evalSafeArithmetic(m[1]);
    if (v != null) {
      return { kind: "arithmetic", expression: m[1].trim(), result: v, summary: `${m[1].trim().replace(/\s+/g, "")} = ${formatNum(v)}.` };
    }
  }
  if (/^[\d\s+\-*/().×÷,]+$/.test(t.trim()) && /[+\-*/×÷]/.test(t)) {
    const v = evalSafeArithmetic(t);
    if (v != null) {
      return { kind: "arithmetic", expression: t.trim(), result: v, summary: `${t.trim().replace(/\s+/g, "")} = ${formatNum(v)}.` };
    }
  }
  const opM = t.match(
    /\b(suma|rest[ae]|multiplica|divide)\s+(\d+(?:[.,]\d+)?)\s*(?:y|por|entre|de|,)\s*(\d+(?:[.,]\d+)?)/i
  );
  if (opM) {
    const a = parseEsNumber(opM[2]);
    const b = parseEsNumber(opM[3]);
    if (a == null || b == null) return null;
    const op = opM[1].toLowerCase();
    let r = null;
    let expr = "";
    if (op.startsWith("sum")) {
      r = a + b;
      expr = `${a}+${b}`;
    } else if (op.startsWith("rest")) {
      r = a - b;
      expr = `${a}-${b}`;
    } else if (op.startsWith("mult")) {
      r = a * b;
      expr = `${a}*${b}`;
    } else if (op.startsWith("div")) {
      if (b === 0) return { kind: "arithmetic", error: "división por cero", summary: "No se puede dividir entre 0." };
      r = a / b;
      expr = `${a}/${b}`;
    }
    r = clampNum(r);
    if (r == null) return null;
    return { kind: "arithmetic", expression: expr, result: r, summary: `${expr} = ${formatNum(r)}.` };
  }
  return null;
}

export function trySolveMath(userText) {
  const t = String(userText || "").trim();
  if (!t || t.length > 2000) return { hit: false };

  const schedule = solveDurationSchedule(t);
  if (schedule) return { hit: true, summary: schedule.summary, data: schedule };

  const pct = solvePercent(t);
  if (pct) return { hit: true, summary: pct.summary, data: pct };

  const ar = solveDirectArithmetic(t);
  if (ar) return { hit: true, summary: ar.summary, data: ar };

  return { hit: false };
}

export function mathContextNote(result) {
  if (!result?.hit || !result.summary) return "";
  return (
    "HERRAMIENTA MATEMÁTICA (resultado exacto, no lo inventes ni lo cambies): " +
    result.summary +
    " Usa este resultado en tu respuesta. Explica en 1–3 frases claras. No digas que lo calculaste a mano si usas este dato."
  );
}
