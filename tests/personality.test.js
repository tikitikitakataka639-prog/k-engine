import assert from "node:assert/strict";
import { injectPersonality, finalizeAssistantText, sanitizeCorporateRefusal } from "../src/engine/personalityInjector.js";
import { getGenConfig } from "../src/engine/genConfig.js";

const model = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const history = [{ role: "user", content: "Explícame una función JavaScript en español." }];
const normal = injectPersonality({ modelId: model, contextWindow: 4096, history });
assert.equal(normal.messages[0].role, "system", "el system prompt se conserva");
assert.match(normal.messages.at(-1).content, /JavaScript/, "se conserva la petición actual");
assert.equal(normal.temperature, getGenConfig(model).temperature, "usa temperatura configurada");
assert.equal(normal.top_p, getGenConfig(model).top_p, "usa top_p configurado");

const fewShot = injectPersonality({ modelId: model, contextWindow: 4096, history, includeFewShot: true });
assert(fewShot.messages.some(m => m.content.includes("Solicitud de reunión")), "includeFewShot inserta ejemplos reales");
assert.equal(fewShot.messages.at(-1).content, history[0].content, "los ejemplos no desplazan la petición actual");

const original = "Lo siento, pero no puedo ayudar con eso. Sin embargo, puedo explicar la ley aplicable.";
assert.equal(finalizeAssistantText(original, "Explícame la ley"), original, "no sustituye silenciosamente la respuesta del modelo");
assert.equal(sanitizeCorporateRefusal(original), original, "el sanitizador no inventa una respuesta alternativa");
assert.equal(finalizeAssistantText("  Respuesta útil  "), "Respuesta útil", "recorta solo espacios exteriores");

console.log("OK: personalidad, few-shot, parámetros y conservación de salida");
