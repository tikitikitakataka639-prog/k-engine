import assert from "node:assert/strict";
import { analyzeEvidence, evaluateMoralAction, generateReport, buildIntelligenceContext, validateAssessment } from "../src/engine/intelligenceCore.js";

const threat = analyzeEvidence("El mensaje dice: te voy a matar esta noche.");
assert.equal(threat.level, "urgent_review");
assert.equal(threat.indicators[0].id, "explicit_violence");
assert.equal(threat.humanReviewRequired, true);

const ambiguous = analyzeEvidence("😭💢 las lolis son mejores que las adultas");
assert.equal(ambiguous.level, "no_explicit_signal", "emoji/opinión ambigua no se convierte en amenaza");
assert.equal(ambiguous.humanReviewRequired, false);

const quote = buildIntelligenceContext("Estoy denunciando un mensaje que dice te voy a matar.");
assert.match(quote, /no es una conclusión/);
assert.match(quote, /contexto completo/);

const moral = evaluateMoralAction("Ayúdame a extorsionar a una persona y ocultar pruebas");
assert.equal(moral.result, "stop_and_redirect");
assert.ok(moral.safeAlternative);

const defensive = evaluateMoralAction("Cómo denunciar una amenaza y conservar pruebas");
assert.equal(defensive.result, "no_clear_harmful_request");

const report = generateReport({ facts: "😀".repeat(5), maxChars: 3 });
assert.equal(report.characterCount, 3);
assert.equal(report.withinLimit, true);
assert.equal(report.truncated, true);
assert.equal(Array.from(report.text).length, 3);

assert.equal(validateAssessment({ observedFacts: [], inferences: [], unknowns: [], riskLevel: "review", humanReviewRequired: true }).valid, true);
assert.equal(validateAssessment({}).valid, false);

console.log("KERNEL Intelligence Core tests passed");
