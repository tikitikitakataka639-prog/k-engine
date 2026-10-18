/**
 * Pruebas críticas: math tool en la ruta real + override cuando el modelo se equivoca.
 */
import { trySolveMath } from "../src/engine/mathTools.js";
import { injectPersonality, finalizeAssistantText } from "../src/engine/personalityInjector.js";
import {
  guardAssistantOutput,
  modelAgreesWithMath,
  detectRepetitionLoop,
  collapseRepetition,
} from "../src/engine/outputGuard.js";
import { getModelProfile } from "../src/engine/modelProfiles.js";
import { KERNEL_MODEL_IDS } from "../src/engine/modelRegistry.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("ok:", msg);
  }
}

const SCHEDULE_Q =
  "Tengo tres tareas de 20, 35 y 15 minutos. Empiezo a las 16:10. ¿A qué hora termino?";

const math = trySolveMath(SCHEDULE_Q);
assert(math.hit === true, "schedule detectado");
assert(math.data.totalMinutes === 70, "total 70 min");
assert(math.data.end === "17:20", "fin 17:20 (no 16:55)");
assert(math.data.start === "16:10", "inicio 16:10");

const m99 = trySolveMath("calcula 12*8+3");
assert(m99.hit && m99.data.result === 99, "12*8+3 = 99");

for (const q of ["hola", "solo te he saludado", "explica qué es un array", "buenas tardes"]) {
  assert(trySolveMath(q).hit === false, `no math: ${q}`);
}

const wrong = "16:55";
assert(modelAgreesWithMath(wrong, math.data) === false, "16:55 no coincide con 17:20");
const fixed = finalizeAssistantText(wrong, SCHEDULE_Q, { math });
assert(/17:20/.test(fixed), `override contiene 17:20, got: ${fixed}`);
assert(!/16:55/.test(fixed), `override no contiene 16:55, got: ${fixed}`);
assert(/70/.test(fixed), "override menciona 70 minutos");

const wrong2 = "Terminas a las 16:55 aproximadamente.";
const fixed2 = guardAssistantOutput(wrong2, SCHEDULE_Q, {
  mathHit: true,
  mathData: math.data,
  mathSummary: math.summary,
});
assert(/17:20/.test(fixed2) && !/16:55/.test(fixed2), `guard override 16:55→17:20: ${fixed2}`);

const good = "Sumas 70 minutos: terminas a las 17:20.";
const kept = finalizeAssistantText(good, SCHEDULE_Q, { math });
assert(/17:20/.test(kept), "respuesta correcta del modelo se conserva");

const badAr = finalizeAssistantText("El resultado es 100.", "calcula 12*8+3", { math: m99 });
assert(/99/.test(badAr), `override aritmética a 99: ${badAr}`);

assert(detectRepetitionLoop("16:55\n16:55\n16:55") === true, "detecta bucle 16:55");
assert(detectRepetitionLoop("hola mundo") === false, "no falso positivo frase corta única");
const collapsed = collapseRepetition("16:55\n16:55\n16:55\n16:55");
assert((collapsed.match(/16:55/g) || []).length <= 2, `collapse reduce repeticiones: ${collapsed}`);

const empty = finalizeAssistantText("", SCHEDULE_Q, { math });
assert(/17:20/.test(empty), `vacío + math → 17:20: ${empty}`);

// Sin opts.math — solo userText (ruta lab mínima)
const bare = finalizeAssistantText("16:55", SCHEDULE_Q, {});
assert(/17:20/.test(bare) && !/16:55/.test(bare), `bare finalize 16:55→17:20: ${bare}`);

for (const id of KERNEL_MODEL_IDS) {
  const inj = injectPersonality({
    modelId: id,
    contextWindow: 4096,
    history: [{ role: "user", content: SCHEDULE_Q }],
  });
  assert(inj.math?.hit === true, `inject math hit: ${id}`);
  assert(inj.math?.data?.end === "17:20", `inject end 17:20: ${id}`);
  assert(/HERRAMIENTA MATEMÁTICA/.test(inj.messages[0].content), `system tool note: ${id}`);
  const profile = getModelProfile(id);
  assert(profile.gen.max_tokens >= 256, `perfil gen ok: ${id}`);
}

function simulateLabFinalize(userText, modelRaw) {
  const injected = injectPersonality({
    modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    contextWindow: 4096,
    history: [{ role: "user", content: userText }],
  });
  return finalizeAssistantText(modelRaw, userText, {
    math: injected.math?.hit ? injected.math : null,
    mathSummary: injected.math?.hit ? injected.math.summary : "",
  });
}
const labOut = simulateLabFinalize(SCHEDULE_Q, "16:55");
assert(labOut.includes("17:20"), `ruta lab completa 16:55→17:20: ${labOut}`);
assert(!labOut.includes("16:55"), `ruta lab no deja 16:55: ${labOut}`);

const labLoop = simulateLabFinalize(SCHEDULE_Q, "16:55\n16:55\n16:55");
assert(labLoop.includes("17:20"), `ruta lab bucle→17:20: ${labLoop}`);

console.log(failed === 0 ? "\nALL mathOverride tests PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
