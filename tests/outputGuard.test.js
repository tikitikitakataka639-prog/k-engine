import assert from "node:assert/strict";
import { detectRepetitionLoop, collapseRepetition } from "../src/engine/outputGuard.js";

const loop = `A
2. **Firmar acusaciones de contenido ilegal**: La plataforma debe firmar acusaciones repetidas.
3. **Firmar acusaciones de contenido ilegal**: La plataforma debe firmar acusaciones repetidas.
4. **Firmar acusaciones de contenido ilegal**: La plataforma debe firmar acusaciones repetidas.
5. **Firmar acusaciones de contenido ilegal**: La plataforma debe firmar acusaciones repetidas.`;

assert.equal(detectRepetitionLoop(loop), true, "detecta bucle de puntos numerados casi iguales");
const collapsed = collapseRepetition(loop);
assert.equal(collapsed.split("\n").filter(Boolean).length <= 3, true, "colapsa repeticiones numeradas");
assert.equal(detectRepetitionLoop("Hola. Un párrafo normal sin repetición grave."), false);

console.log("ALL outputGuard tests PASSED");
