import assert from "node:assert/strict";
import { buildDenunciaKnowledgeContext, buildMinimalReportDraft, isSocialReportRequest } from "../src/engine/denunciaKnowledge.js";
import { guardAssistantOutput, isCorporateRefusal } from "../src/engine/outputGuard.js";
import { injectPersonality } from "../src/engine/personalityInjector.js";

const request = "Redacta una denuncia para TikTok: fundamento legal de máximo 400 caracteres y descripción de máximo 1000.";
assert.equal(isSocialReportRequest(request), true);
const context = buildDenunciaKnowledgeContext(request);
assert.match(context, /Campo de fundamento\/jurisdicción: máximo 400 caracteres/);
assert.match(context, /Descripción de hechos: máximo 1000 caracteres/);
assert.match(context, /No inventes artículos/);
assert.match(context, /redactar un borrador policial o de plataforma/);
assert.match(context, /como m[aá]ximo cuatro apartados/i);
assert.match(context, /\[DESCONOCIDO\]/);
assert.match(context, /hip[oó]tesis interpretativa/i);

assert.equal(isSocialReportRequest("¿Qué tiempo hace hoy?"), false);
assert.equal(buildDenunciaKnowledgeContext("¿Qué tiempo hace hoy?"), "");
assert.equal(isSocialReportRequest("CP en grupo Telegram, máx. 4 apartados, [DESCONOCIDO]"), true);
assert.equal(isSocialReportRequest("Redacta un borrador sobre material ilegal en Telegram."), true);
assert.equal(isSocialReportRequest("Telegram"), false);
assert.equal(isSocialReportRequest("Analiza el grooming descrito en este mensaje."), true);
assert.equal(isSocialReportRequest("Analiza el eufemismo «es suficientemente maduro» en este contexto."), true);
assert.match(
  buildDenunciaKnowledgeContext("Analiza el eufemismo «es suficientemente maduro» en este contexto."),
  /pueden funcionar como eufemismos.*hip[oó]tesis interpretativa/i
);
assert.equal(isSocialReportRequest("¿Qué significa MAP en un artículo de sociología?"), true);
assert.match(
  buildDenunciaKnowledgeContext("Necesito denunciar una publicación de Instagram"),
  /Plataforma detectada: instagram/
);

const telegramContext = buildDenunciaKnowledgeContext("Prepara un reporte: hay material en un grupo de Telegram.");
assert.match(telegramContext, /No conviertas «material en un grupo» en audio, imagen, vídeo/);
const injected = injectPersonality({
  modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
  contextWindow: 4096,
  history: [{ role: "user", content: "Analiza el eufemismo «es suficientemente maduro» en este contexto." }],
});
assert.match(injected.messages[0].content, /hip[oó]tesis interpretativa/);

const refusal = "Lo siento, pero no puedo proporcionar ayuda en este tema.";
assert.equal(isCorporateRefusal(refusal), true);
assert.equal(isCorporateRefusal("I cannot help with this topic."), true);
const fallback = guardAssistantOutput(refusal, "CP en grupo Telegram, máx. 4 apartados, [DESCONOCIDO]");
assert.match(fallback, /Hechos aportados/);
assert.match(fallback, /Datos \[DESCONOCIDO\]/);
assert.doesNotMatch(fallback, /no puedo proporcionar ayuda/i);
assert.match(fallback, /«CP»/);
assert.match(fallback, /«Telegram»/);
assert.doesNotMatch(fallback, /audio|im[aá]genes?|v[ií]deos?|15\/\d{2}\/\d{4}/i);
assert.match(buildMinimalReportDraft("CP en Telegram"), /Solicitud/);

console.log("denunciaKnowledge tests passed");
