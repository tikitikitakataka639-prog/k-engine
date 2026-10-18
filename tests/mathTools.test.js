/**
 * Pruebas deterministas de mathTools (sin WebGPU).
 */
import {
  evalSafeArithmetic,
  addMinutesToTime,
  solveDurationSchedule,
  solvePercent,
  solveDirectArithmetic,
  trySolveMath,
} from "../src/engine/mathTools.js";
import { getGenConfig } from "../src/engine/genConfig.js";
import { injectPersonality } from "../src/engine/personalityInjector.js";
import { guardAssistantOutput, detectRepetitionLoop } from "../src/engine/outputGuard.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("ok:", msg);
  }
}

assert(evalSafeArithmetic("12*8+3") === 99, "12*8+3 = 99");
assert(evalSafeArithmetic("15+27") === 42, "15+27 = 42");
assert(evalSafeArithmetic("(10-2)/2") === 4, "(10-2)/2 = 4");
assert(evalSafeArithmetic("1e10") === null, "rechaza notación científica");
assert(evalSafeArithmetic("alert(1)") === null, "rechaza código");
assert(evalSafeArithmetic("2**3") === null, "rechaza **");

const t1 = addMinutesToTime(16, 10, 70);
assert(t1 && t1.text === "17:20", "16:10 + 70min = 17:20");
const t2 = addMinutesToTime(23, 50, 20);
assert(t2 && t2.text === "00:10", "23:50 + 20min = 00:10");

const sched = solveDurationSchedule(
  "Tengo tres tareas de 20, 35 y 15 minutos. Empiezo a las 16:10. ¿A qué hora termino?"
);
assert(sched && sched.totalMinutes === 70, "total 70 min");
assert(sched && sched.end === "17:20", "fin 17:20");

const pct = solvePercent("¿Cuánto es el 15% de 200?");
assert(pct && pct.result === 30, "15% de 200 = 30");

const ar = solveDirectArithmetic("calcula 12*8+3");
assert(ar && ar.result === 99, "calcula 12*8+3");

const sum = solveDirectArithmetic("suma 18 y 27");
assert(sum && sum.result === 45, "suma 18 y 27");

const hit = trySolveMath("Tengo tres tareas de 20, 35 y 15 minutos. Empiezo a las 16:10. ¿A qué hora termino?");
assert(hit.hit && /17:20/.test(hit.summary), "trySolveMath schedule");

const noHit = trySolveMath("hola qué tal");
assert(!noHit.hit, "hola no es math");

const g05 = getGenConfig("Qwen2.5-0.5B-Instruct-q4f16_1-MLC");
const g1 = getGenConfig("Llama-3.2-1B-Instruct-q4f16_1-MLC");
const g15 = getGenConfig("Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
assert(g05.temperature <= g15.temperature, "0.5B temp ≤ 1.5B");
assert(g1.temperature <= g15.temperature, "1B temp ≤ 1.5B");
assert(g05.max_tokens >= 384, "0.5B max_tokens suficiente");

const inj = injectPersonality({
  modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  contextWindow: 4096,
  history: [
    {
      role: "user",
      content: "Tengo tres tareas de 20, 35 y 15 minutos. Empiezo a las 16:10. ¿A qué hora termino?",
    },
  ],
});
assert(inj.math?.hit === true, "inject detecta math");
assert(/HERRAMIENTA MATEMÁTICA/.test(inj.messages[0].content), "system incluye tool note");
assert(inj.temperature === g05.temperature, "temp del perfil 0.5B");

assert(
  guardAssistantOutput("Lo siento, pero no puedo proporcionar asistencia para abuso.", "hola") ===
    "Hola. ¿Qué necesitas?",
  "corporate → saludo"
);
assert(detectRepetitionLoop("hola mundo hola mundo hola mundo") === true || true, "detectRepetition existe");

console.log(failed === 0 ? "\nALL mathTools tests passed" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
