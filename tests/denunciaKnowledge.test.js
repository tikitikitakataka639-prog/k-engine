import assert from "node:assert/strict";
import { buildDenunciaKnowledgeContext, isSocialReportRequest } from "../src/engine/denunciaKnowledge.js";

const request = "Redacta una denuncia para TikTok: fundamento legal de máximo 400 caracteres y descripción de máximo 1000.";
assert.equal(isSocialReportRequest(request), true);
const context = buildDenunciaKnowledgeContext(request);
assert.match(context, /Campo de fundamento\/jurisdicción: máximo 400 caracteres/);
assert.match(context, /Descripción de hechos: máximo 1000 caracteres/);
assert.match(context, /No inventes artículos/);
assert.match(context, /No rechaces una denuncia legítima/);
assert.match(context, /recuento de caracteres/);

assert.equal(isSocialReportRequest("¿Qué tiempo hace hoy?"), false);
assert.equal(buildDenunciaKnowledgeContext("¿Qué tiempo hace hoy?"), "");
assert.match(
  buildDenunciaKnowledgeContext("Necesito denunciar una publicación de Instagram"),
  /Plataforma detectada: instagram/
);

console.log("denunciaKnowledge tests passed");
