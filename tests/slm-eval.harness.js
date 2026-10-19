/**
 * Batería de evaluación SLM (estructura reproducible).
 * Sin WebGPU no ejecuta modelos reales: valida herramientas + perfiles + casos.
 */

import { trySolveMath } from "../src/engine/mathTools.js";
import { injectPersonality } from "../src/engine/personalityInjector.js";
import { getModelProfile } from "../src/engine/modelProfiles.js";
import { DEFAULT_MODEL_ID } from "../src/engine/modelRegistry.js";
import { getSystemPrompt } from "../src/engine/personality.js";

export const MATH_CASES = [
  { id: "M01", input: "calcula 12*8+3", expect: { contains: ["99"] } },
  { id: "M02", input: "suma 18 y 27", expect: { contains: ["45"] } },
  { id: "M03", input: "15+27", expect: { contains: ["42"] } },
  { id: "M04", input: "¿Cuánto es el 15% de 200?", expect: { contains: ["30"] } },
  { id: "M05", input: "Tengo tres tareas de 20, 35 y 15 minutos. Empiezo a las 16:10. ¿A qué hora termino?", expect: { contains: ["17:20", "70"] } },
  { id: "M06", input: "multiplica 7 por 8", expect: { contains: ["56"] } },
  { id: "M07", input: "divide 100 entre 4", expect: { contains: ["25"] } },
  { id: "M08", input: "resta 50 y 18", expect: { contains: ["32"] } },
  { id: "M09", input: "cuánto es (10-2)/2", expect: { contains: ["4"] } },
  { id: "M10", input: "Empiezo a las 09:00. Trabajo 90 minutos. ¿A qué hora acabo?", expect: { contains: ["10:30"] } },
];

export const CODE_CASES = [
  { id: "C01", input: "Elimina duplicados de [1, 2, 1, 3, 2] conservando el orden.", expect: { contains: ["1", "2", "3"] } },
  { id: "C02", input: "Escribe una función JS que invierta un string.", expect: { contains: ["function", "return"] } },
  { id: "C03", input: "Explica qué hace: arr.filter((x,i,a)=>a.indexOf(x)===i)", expect: { keywords: ["duplic", "orden"] } },
  { id: "C04", input: "Corrige: for(let i=0;i<=arr.length;i++) console.log(arr[i])", expect: { keywords: ["length", "<"] } },
  { id: "C05", input: "Devuelve solo el código: suma de array de números en JS, una línea.", expect: { contains: ["reduce"] } },
];

export const COMM_CASES = [
  { id: "G01", input: "hola", expect: { notCorporate: true } },
  { id: "G02", input: "solo te he saludado", expect: { notCorporate: true } },
  { id: "G03", input: "resume en una frase: el sol es una estrella", expect: { keywords: ["sol", "estrella"] } },
  { id: "G04", input: "necesito pasos para denunciar acoso en una red social", expect: { notCorporate: true } },
  { id: "G05", input: "no sé si mi conclusión es correcta: 2+2=5", expect: { keywords: ["4"] } },
];

export const MODELS = [
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
];

export function runOfflineEval() {
  const report = { math: [], profiles: [], inject: [], passed: 0, failed: 0 };

  const defaultOk = DEFAULT_MODEL_ID === "Llama-3.2-3B-Instruct-q4f16_1-MLC";
  report.profiles.push({ id: "DEFAULT_MODEL_ID", ok: defaultOk, value: DEFAULT_MODEL_ID });
  if (defaultOk) report.passed++; else report.failed++;
  const prompt3B = getSystemPrompt(DEFAULT_MODEL_ID, 4096);
  const promptOk =
    /No te presentes como IA/.test(prompt3B) &&
    /HIPÓTESIS/.test(prompt3B) &&
    /no demuestra que alguien mienta/i.test(prompt3B) &&
    /No inventes indicios/i.test(prompt3B);
  report.inject.push({ id: "Llama-3.2-3B personality prompt", ok: promptOk });
  if (promptOk) report.passed++; else report.failed++;

  for (const c of MATH_CASES) {
    const r = trySolveMath(c.input);
    const ok = r.hit && c.expect.contains.every((s) => String(r.summary).includes(s));
    report.math.push({ id: c.id, ok, summary: r.summary || null });
    if (ok) report.passed++;
    else report.failed++;
  }

  for (const id of MODELS) {
    const p = getModelProfile(id);
    const ok = p.gen.temperature > 0 && p.gen.max_tokens >= 256;
    report.profiles.push({ id, ok, gen: p.gen, isTiny: p.isTiny });
    if (ok) report.passed++;
    else report.failed++;
  }

  for (const id of ["Qwen2.5-0.5B-Instruct-q4f16_1-MLC", "Llama-3.2-1B-Instruct-q4f16_1-MLC", "Llama-3.2-3B-Instruct-q4f16_1-MLC"]) {
    const inj = injectPersonality({
      modelId: id,
      contextWindow: 4096,
      history: [{ role: "user", content: MATH_CASES[4].input }],
      includeFewShot: id === "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    });
    const ok = inj.math?.hit && /HERRAMIENTA MATEMÁTICA/.test(inj.messages[0]?.content || "") && (id !== "Llama-3.2-3B-Instruct-q4f16_1-MLC" || inj.messages.some((m) => /sin convertir sospechas/i.test(m.content)));
    report.inject.push({ id, ok });
    if (ok) report.passed++;
    else report.failed++;
  }

  const brainId = "Llama-3.2-3B-Instruct-q4f16_1-MLC";
  const casual = injectPersonality({
    modelId: brainId,
    contextWindow: 4096,
    history: [{ role: "user", content: "hola, estoy probando el modelo" }],
  });
  const casualNoFewShot = !casual.messages.some((m) => /Un registro muestra una tarjeta asignada a Ana/i.test(m.content));
  report.inject.push({ id: "Llama 3B casual chat avoids analytical few-shot", ok: casualNoFewShot });
  if (casualNoFewShot) report.passed++; else report.failed++;

  const analytical = injectPersonality({
    modelId: brainId,
    contextWindow: 4096,
    history: [{ role: "user", content: "Analiza el caso de la tarjeta de acceso: ¿la persona miente?" }],
  });
  const analyticalFewShot = analytical.messages.some((m) => /No se puede concluir que Ana mienta/i.test(m.content));
  report.inject.push({ id: "Llama 3B analysis includes evidence-discipline example", ok: analyticalFewShot });
  if (analyticalFewShot) report.passed++; else report.failed++;

  return report;
}

const report = runOfflineEval();
console.log(JSON.stringify(report, null, 2));
console.log(report.failed === 0 ? "OFFLINE EVAL PASS" : "OFFLINE EVAL FAIL");
process.exit(report.failed === 0 ? 0 : 1);
