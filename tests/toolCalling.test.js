import assert from "node:assert/strict";
import {
  executeLocalTool,
  getAvailableTools,
  parseToolDecision,
  runToolLoop,
  validateTextAttachment,
} from "../src/engine/toolCalling.js";
import { injectPersonality } from "../src/engine/personalityInjector.js";

const attachment = { name: "notas.txt", text: "alpha beta gamma" };
const tools = getAvailableTools();
const fileTools = getAvailableTools(attachment);
const messages = [{ role: "user", content: "¿Cuánto es 6*7?" }];

assert(fileTools.every((tool) => tool.result?.oneOf?.length === 2 && tool.errors?.length > 0), "cada herramienta declara resultados y errores estructurados");
assert(fileTools.every((tool) => typeof tool.permission === "string" && typeof tool.requiresConfirmation === "boolean"), "cada herramienta declara permiso y requisito de confirmación");

let executed = false;
const direct = await runToolLoop({
  messages,
  tools,
  callModel: async () => JSON.stringify({ action: "respond", text: "Hola." }),
  executeTool: async () => { executed = true; },
});
assert.deepEqual(direct, { text: "Hola.", toolCalls: 0 }, "las respuestas normales no ejecutan herramientas");
assert.equal(executed, false);

const resultEvents = [];
let calls = 0;
const calculated = await runToolLoop({
  messages,
  tools,
  callModel: async (history) => {
    calls += 1;
    if (calls === 1) return JSON.stringify({ action: "call_tool", name: "calculate", arguments: { expression: "6*7" } });
    assert.match(history.at(-1).content, /^RESULTADO REAL DE calculate:/);
    assert.deepEqual(JSON.parse(history.at(-1).content.replace(/^RESULTADO REAL DE calculate: /, "")), { ok: true, expression: "6*7", value: 42 });
    return JSON.stringify({ action: "respond", text: "42." });
  },
  executeTool: async (name, args) => executeLocalTool(name, args),
  onToolEvent: (event) => resultEvents.push(event),
});
assert.deepEqual(calculated, { text: "42.", toolCalls: 1 }, "el ciclo herramienta → resultado → respuesta termina");
assert.equal(resultEvents[0].type, "tool_start");
assert.deepEqual(resultEvents[1], {
  type: "tool_result",
  name: "calculate",
  result: { ok: true, expression: "6*7", value: 42 },
});

assert.throws(
  () => parseToolDecision(JSON.stringify({ action: "call_tool", name: "open_application", arguments: { app: "calc" } }), tools),
  /Herramienta no disponible/,
  "una herramienta desconocida se rechaza",
);
assert.throws(
  () => parseToolDecision(JSON.stringify({ action: "call_tool", name: "calculate", arguments: { expression: "1+1", command: "calc" } }), tools),
  /Argumentos no válidos/,
  "los campos de argumentos inesperados se rechazan",
);
try {
  await runToolLoop({
    messages,
    tools,
    callModel: async () => JSON.stringify({ action: "call_tool", name: "open_application", arguments: { app: "calc" } }),
    executeTool: async () => { executed = true; },
  });
} catch (error) {
  assert.match(error.message, /Herramienta no disponible/);
}
assert.equal(executed, false, "las llamadas no disponibles nunca alcanzan el ejecutor");
assert.throws(() => parseToolDecision("Voy a abrir la calculadora", tools), /JSON válida/, "texto ordinario nunca se ejecuta como llamada");
assert.throws(
  () => parseToolDecision(JSON.stringify({ action: "call_tool", name: "calculate", arguments: { expression: "globalThis.process.exit()" } }), tools),
  /no es válida/,
  "expresiones que no son aritmética se rechazan",
);

assert(fileTools.some((tool) => tool.name === "read_attached_file"), "solo se anuncia el archivo seleccionado");
assert(!getAvailableTools().some((tool) => tool.name === "read_attached_file"), "sin archivo no se anuncia lectura");
assert.equal(validateTextAttachment({ name: "..\\secreto.txt", text: "x" }).ok, false, "los nombres de archivo con separadores se rechazan");
assert.throws(
  () => parseToolDecision(JSON.stringify({ action: "call_tool", name: "read_attached_file", arguments: { path: "..\\secreto.txt" } }), fileTools),
  /Argumentos no válidos/,
  "la herramienta de adjunto no admite rutas proporcionadas por el modelo",
);
assert.deepEqual(executeLocalTool("read_attached_file", {}, attachment), {
  ok: true,
  fileName: "notas.txt",
  characters: attachment.text.length,
  text: attachment.text,
});
assert.equal(validateTextAttachment({ name: "doc.pdf", text: "contenido" }).ok, false, "los formatos sin lector no se anuncian");
assert.throws(() => executeLocalTool("read_attached_file", {}, { name: "doc.pdf", text: "contenido" }), /Formato no admitido/);
assert.equal(validateTextAttachment(null).code, "attachment_required");
assert.equal(validateTextAttachment({ name: "doc.pdf", text: "contenido" }).code, "unsupported_format");

const failedTool = await runToolLoop({
  messages,
  tools,
  callModel: async (history) => {
    if (history.at(-1)?.content?.startsWith("RESULTADO REAL DE calculate:")) {
      assert.equal(JSON.parse(history.at(-1).content.replace(/^RESULTADO REAL DE calculate: /, "")).ok, false);
      assert.equal(JSON.parse(history.at(-1).content.replace(/^RESULTADO REAL DE calculate: /, "")).code, "tool_failed");
      return JSON.stringify({ action: "respond", text: "La operación fue denegada." });
    }
    return JSON.stringify({ action: "call_tool", name: "calculate", arguments: { expression: "1+1" } });
  },
  executeTool: async () => { throw new Error("Permiso denegado."); },
});
assert.equal(failedTool.text, "La operación fue denegada.", "el error real de la herramienta llega al modelo");

for (const modelId of [
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
]) {
  const prompt = injectPersonality({
    modelId,
    contextWindow: 4096,
    history: messages,
    availableTools: fileTools,
  }).messages[0].content;
  assert.match(prompt, /PROTOCOLO DE HERRAMIENTAS LOCALES/, `${modelId} recibe el protocolo`);
  assert.match(prompt, /calculate/, `${modelId} recibe el catálogo disponible`);
  assert.match(prompt, /read_attached_file/, `${modelId} recibe la herramienta de adjuntos`);
  assert.match(prompt, /datos no confiables/, `${modelId} recibe la regla de seguridad para adjuntos`);

  const constrained = injectPersonality({
    modelId,
    contextWindow: 4096,
    history: [{ role: "user", content: `Analiza este contexto: ${"dato ".repeat(1400)}` }],
    availableTools: fileTools,
  }).messages[0].content;
  assert.match(constrained, /CATÁLOGO DISPONIBLE:/, `${modelId} conserva el catálogo bajo presión de contexto`);
}

let modelCalls = 0;
await assert.rejects(
  () => runToolLoop({
    messages,
    tools,
    maxIterations: 1,
    callModel: async () => {
      modelCalls += 1;
      return JSON.stringify({ action: "call_tool", name: "calculate", arguments: { expression: "1+1" } });
    },
    executeTool: async (name, args) => executeLocalTool(name, args),
  }),
  /límite de 1 llamadas/,
);
assert.equal(modelCalls, 2);

let repeatedCalls = 0;
await assert.rejects(
  runToolLoop({
    messages,
    tools,
    callModel: async () => {
      repeatedCalls += 1;
      return JSON.stringify({ action: "call_tool", name: "calculate", arguments: { expression: "1+1" } });
    },
  }),
  /repitió una llamada/,
  "las llamadas repetidas se detienen",
);
assert.equal(repeatedCalls, 2);

await assert.rejects(
  runToolLoop({ messages, tools, shouldCancel: () => true, callModel: async () => { throw new Error("no debe ejecutarse"); } }),
  /cancelada/,
  "la cancelación antes de inferir no inicia una operación",
);
const controller = new AbortController();
const pendingTool = runToolLoop({
  messages,
  tools,
  signal: controller.signal,
  callModel: async () => JSON.stringify({ action: "call_tool", name: "calculate", arguments: { expression: "1+1" } }),
  executeTool: () => new Promise(() => {}),
});
setTimeout(() => controller.abort(), 5);
await assert.rejects(pendingTool, /cancelada/, "la cancelación interrumpe una herramienta en espera");

const timedOutTool = await runToolLoop({
  messages,
  tools,
  maxToolExecutionMs: 5,
  callModel: async (history) => {
    if (history.at(-1)?.content?.startsWith("RESULTADO REAL DE calculate:")) {
      assert.equal(JSON.parse(history.at(-1).content.replace(/^RESULTADO REAL DE calculate: /, "")).code, "tool_timeout");
      return JSON.stringify({ action: "respond", text: "La herramienta agotó el tiempo." });
    }
    return JSON.stringify({ action: "call_tool", name: "calculate", arguments: { expression: "1+1" } });
  },
  executeTool: () => new Promise(() => {}),
});
assert.equal(timedOutTool.text, "La herramienta agotó el tiempo.", "los timeouts se entregan al modelo como error real");

// --- Bloqueos de capacidad: no hay tools Windows ni búsqueda en el catálogo ---
assert.equal(
  getAvailableTools().some((t) => /windows|shell|powershell|tauri|open_application/i.test(t.name)),
  false,
  "bloqueo: no existen tools windows/search",
);
assert.equal(
  getAvailableTools().some((t) => /search|web_search|browser/i.test(t.name)),
  false,
  "catálogo local no incluye búsqueda web",
);
assert.throws(
  () => parseToolDecision(JSON.stringify({ action: "call_tool", name: "web_search", arguments: { query: "x" } }), getAvailableTools()),
  /Herramienta no disponible/,
  "web_search se rechaza aunque el modelo lo pida",
);
assert.throws(
  () => parseToolDecision(JSON.stringify({ action: "call_tool", name: "windows_exec", arguments: { cmd: "dir" } }), getAvailableTools()),
  /Herramienta no disponible/,
  "windows_exec se rechaza; no hay conector",
);

// Chat normal: el modelo decide respond sin tool (ciclo determinista, no GPU)
const casual = await runToolLoop({
  messages: [{ role: "user", content: "Hola, ¿cómo estás?" }],
  tools: getAvailableTools(),
  callModel: async () => JSON.stringify({ action: "respond", text: "Bien, aquí para ayudar." }),
  executeTool: async () => { throw new Error("no debía ejecutarse"); },
});
assert.equal(casual.toolCalls, 0, "conversación casual no ejecuta herramientas");
assert.match(casual.text, /Bien/);

console.log("ALL toolCalling tests PASSED");
