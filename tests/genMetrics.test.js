import { computeGenMetrics, formatMetricsForUi } from "../src/engine/genMetrics.js";

let failed = 0;
function assert(c, m) {
  if (!c) {
    failed++;
    console.error("FAIL", m);
  } else console.log("ok", m);
}

const a = computeGenMetrics({ completionTokens: 366, genMs: 49000, firstTokenMs: 12000 });
assert(a.tokens === 366, "tokens");
assert(a.overallTps === 7.5, `overall ${a.overallTps}`);
assert(a.decodeTps === 9.9, `decode ${a.decodeTps}`);

const b = computeGenMetrics({ completionTokens: 10, genMs: 1000 });
assert(b.overallTps === 10, "no first token still overall");
assert(b.decodeTps === 10, "decode falls back to overall");

const c = computeGenMetrics({});
assert(c.tokens === null && c.overallTps === null, "empty stays null");

const ui = formatMetricsForUi({ completionTokens: 366, genMs: 49000, firstTokenMs: 12000 });
assert(ui.tps === "9.9", `ui tps ${ui.tps}`);
assert(ui.tokens === "366", "ui tokens");
assert(ui.firstTok === "12000 ms", "ui first");

console.log(failed ? `${failed} FAILED` : "ALL genMetrics PASSED");
process.exit(failed ? 1 : 0);
