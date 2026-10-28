/**
 * Validador de fidelidad al caso — no debe false-positive en respuestas válidas.
 */
import {
  findInventedNames,
  validateCaseFidelity,
  applyCaseFidelityGuard,
  detectUnverifiedAsFact,
  detectUnsupportedReportDetails,
} from "../src/engine/evidenceFidelity.js";
import { guardAssistantOutput } from "../src/engine/outputGuard.js";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("ok:", msg);
  }
}

const CASE = `Hay dos versiones del mismo incidente y no tengo pruebas independientes.

Versión A: «Solo presté la tarjeta a un compañero para un pago urgente; yo no estaba en el local.»

Versión B: «Él usó la tarjeta en el local a las 18:40; lo vi en la cámara.»

Datos confirmados: existe un cargo con esa tarjeta a las 18:40. No hay más evidencias.

1) Separá hechos, indicios, hipótesis y desconocido.
2) Tratá ambas versiones con el mismo criterio.
3) Proponé 2 comprobaciones neutrales.
4) ¿El uso de la tarjeta demuestra por sí solo quién la usó?`;

const badAna = `Hechos: cargo a las 18:40.
Indicios: Ana dice que prestó la tarjeta.
La observación de la cámara está confirmada.`;
const names = findInventedNames(CASE, badAna);
assert(names.some((n) => /ana/i.test(n)), `detecta Ana inventada: ${names}`);

const camIssues = detectUnverifiedAsFact(CASE, badAna);
assert(camIssues.some((i) => i.code === "unverified_as_fact"), `cámara como hecho: ${JSON.stringify(camIssues)}`);

const v = validateCaseFidelity(CASE, badAna);
assert(v.ok === false, "validation fails on bad response");
assert(v.issues.length >= 2, `multiple issues: ${v.issues.length}`);

const applied = applyCaseFidelityGuard(badAna, CASE);
assert(applied.fidelity.ok === false, "fidelity not ok");
assert(/Validación de fidelidad/i.test(applied.text), "warning present");
assert(applied.text.includes(badAna), "preserves original model response");
assert(!/medio de acceso|tarjeta\/registro\/cuenta/i.test(applied.text), "does not inject generic access-card template");

const good = `Hechos: existe un cargo con esa tarjeta a las 18:40.

Indicios: ninguna de las dos versiones está corroborada de forma independiente. La versión B afirma haber visto al usuario en una cámara; eso es una declaración, no una grabación examinada.

Hipótesis: A o B podrían ser ciertas, o una mezcla; faltan datos.

Desconocido: quién usó la tarjeta; si existe grabación; identidad del compañero mencionado en A.

Comprobaciones: contrastar el cargo con registros del local (si existen) y pedir la grabación alegada para examinarla, sin presuponer autoría.

Respuesta: no, el uso de la tarjeta no demuestra por sí solo quién la usó.`;
const vg = validateCaseFidelity(CASE, good);
assert(vg.ok === true, `good response passes: ${JSON.stringify(vg.issues)}`);

const hi = applyCaseFidelityGuard("Hola. ¿Qué tal?", "hola");
assert(hi.text === "Hola. ¿Qué tal?" || hi.fidelity.skipped, "saludo intacto");

const out = guardAssistantOutput(badAna, CASE, {});
assert(/Validación de fidelidad/i.test(out), "guard integrates fidelity");

const simpleUser = "Analiza: el mensaje dice 'te voy a denunciar' sin más contexto.";
const simpleAsst = "Hechos: el texto contiene la frase te voy a denunciar. Indicios: tono conflictivo posible. Desconocido: contexto y destinatario.";
assert(validateCaseFidelity(simpleUser, simpleAsst).ok === true, "simple case ok");

const withName = "María dice que no fue ella. Pedro dice lo contrario. Sin pruebas.";
const withNameAsst = "Hechos: no hay pruebas independientes. María y Pedro ofrecen versiones opuestas sin corroborar.";
assert(validateCaseFidelity(withName, withNameAsst).ok === true, "names in user allowed");

// Regression: sentence starts and headings are not names by themselves.
const contaminatedLookingText = `Recibí el mensaje a las 17:45.
Reformulación mínima: los datos no bastan para determinar la autoría.`;
assert(findInventedNames(CASE, contaminatedLookingText).length === 0, "does not flag 'Recibí' or 'Reformulación' as names");

const unrelatedLongPrompt = "Escribe una historia de fantasía con dragones, castillos, tormentas y una ciudad perdida. ".repeat(4);
const unrelatedLongAnswer = "Había una vez una ciudad perdida bajo una montaña, donde los dragones custodiaban un castillo.";
const skippedLong = applyCaseFidelityGuard(unrelatedLongAnswer, unrelatedLongPrompt);
assert(skippedLong.text === unrelatedLongAnswer && skippedLong.fidelity.skipped, "long unrelated prompt skips case-fidelity correction");

const telegramUser = "Prepara un reporte: hay material en un grupo de Telegram.";
const inventedMedia = "Hechos: en el grupo de Telegram se compartieron vídeos y audios.";
const mediaIssues = detectUnsupportedReportDetails(telegramUser, inventedMedia);
assert(mediaIssues.some((i) => i.code === "unsupported_evidence_modality"), "material en Telegram no autoriza a inventar audio o vídeo");
assert(!validateCaseFidelity(telegramUser, inventedMedia).ok, "la fidelidad señala modalidades de evidencia no aportadas");
const guardedMedia = applyCaseFidelityGuard(inventedMedia, telegramUser);
assert(guardedMedia.fidelity.corrected && guardedMedia.text.includes("[DESCONOCIDO]"), "la guarda advierte que debe marcar lo no aportado");
assert(
  detectUnsupportedReportDetails(telegramUser, "No consta si existe vídeo o audio.").length === 0,
  "mencionar modalidades explícitamente desconocidas no se marca como evidencia inventada"
);
const inventedDetails = detectUnsupportedReportDetails(
  telegramUser,
  "El grupo llamado «La Sala Azul» publicó el enlace https://example.invalid/archivo el 15/01/2026."
);
assert(inventedDetails.some((i) => i.code === "unsupported_group_name"), "detecta nombres de grupo no aportados");
assert(inventedDetails.some((i) => i.code === "unsupported_url"), "detecta URLs no aportadas");
assert(inventedDetails.some((i) => i.code === "unsupported_date"), "detecta fechas no aportadas");

const euphemismUser = "Analiza el eufemismo «es suficientemente maduro» como posible minimización.";
const definitiveClaim = "La expresión demuestra grooming.";
assert(
  detectUnsupportedReportDetails(euphemismUser, definitiveClaim).some((i) => i.code === "unqualified_interpretation"),
  "una interpretación de grooming sin cautela se marca como conclusión no sustentada"
);
const cautiousClaim = "La frase podría ser un indicio de minimización; esta lectura es una hipótesis que requiere contexto.";
assert(
  detectUnsupportedReportDetails(euphemismUser, cautiousClaim).length === 0,
  "la interpretación expresada como hipótesis no se marca como hecho"
);

console.log(failed === 0 ? "\nALL evidenceFidelity tests PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
