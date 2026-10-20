/**
 * evidenceFidelity.js
 * Validador determinista de fidelidad al caso (post-inferencia).
 * Detecta nombres propios no presentes en el enunciado y elevación
 * de afirmaciones no verificadas a hechos. Conservador: prioriza
 * no marcar respuestas válidas.
 */

const STOP_CAPS = new Set([
  "El", "La", "Los", "Las", "Un", "Una", "Unos", "Unas", "Lo", "Al", "Del",
  "En", "De", "Por", "Para", "Con", "Sin", "Sobre", "Entre", "Hacia", "Hasta",
  "Si", "No", "Sí", "Que", "Qué", "Cuál", "Cuáles", "Cómo", "Cuándo", "Dónde",
  "Porqué", "Porque", "Pero", "Aunque", "Cuando", "Donde", "Como", "Según",
  "Hechos", "Indicios", "Hipótesis", "Desconocido", "Análisis", "Comprobaciones",
  "Respuesta", "Versión", "Version", "Nivel", "Recomendación", "Contexto",
  "Evidencia", "Pruebas", "Observación", "Observaciones", "Conclusión",
  "España", "Español", "KERNEL", "KENGINE", "WebLLM", "WebGPU", "TikTok",
  "Instagram", "YouTube", "Facebook", "WhatsApp", "Telegram", "Discord",
  "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo",
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto",
  "Septiembre", "Octubre", "Noviembre", "Diciembre",
  "Hecho", "Indicio", "Hipótesis", "Desconocidos", "Alternativa", "Alternativas",
  "Comprobación", "Neutralidad", "Fidelidad", "Criterio", "Criterios",
]);

export function extractProperNameCandidates(text) {
  const t = String(text || "");
  const found = new Set();
  const re =
    /(?:^|[\s«"'([{,;:])([A-ZÁÉÍÓÚÑ][a-záéíóúñü]{1,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{1,}){0,2})(?=[\s,.;:!?)»\]}"]|$)/gm;
  let m;
  while ((m = re.exec(t)) !== null) {
    const full = m[1].trim();
    const parts = full.split(/\s+/);
    if (parts.every((p) => STOP_CAPS.has(p))) continue;
    if (/^Versi[oó]n$/i.test(parts[0]) && parts.length <= 2) continue;
    for (const p of parts) {
      if (STOP_CAPS.has(p)) continue;
      if (p.length < 2) continue;
      found.add(p);
    }
    if (parts.length > 1 && !parts.every((p) => STOP_CAPS.has(p))) {
      found.add(full);
    }
  }
  return [...found];
}

export function findInventedNames(userText, assistantText) {
  const inUser = new Set(
    extractProperNameCandidates(userText).map((n) => n.toLowerCase())
  );
  const userLower = String(userText || "").toLowerCase();
  const invented = [];
  for (const name of extractProperNameCandidates(assistantText)) {
    const low = name.toLowerCase();
    if (inUser.has(low)) continue;
    if (userLower.includes(low)) continue;
    invented.push(name);
  }
  return invented;
}

export function detectUnverifiedAsFact(userText, assistantText) {
  const u = String(userText || "").toLowerCase();
  const a = String(assistantText || "");
  const issues = [];

  const userHasConfirmedCamera =
    /c[aá]mara.{0,40}(confirmad|verificad|revisad|examinad)|grabaci[oó]n.{0,40}(confirmad|verificad|disponible y revis)|hemos visto (la|en) (c[aá]mara|grabaci)/i.test(
      u
    );
  const userMentionsCameraClaim =
    /c[aá]mara|grabaci[oó]n|v[ií]deo|testigo/i.test(u);

  if (!userHasConfirmedCamera && userMentionsCameraClaim) {
    const factCamera =
      /(?:^|\n)\s*[-*•]?\s*(?:hechos?\s*[:：])[^\n]{0,120}(c[aá]mara|grabaci[oó]n|v[ií]deo)/im.test(
        a
      ) ||
      /\b(est[aá] confirmad[oa]|queda confirmad[oa]|se ha confirmado|est[aá] verificad[oa])\b[^.!?\n]{0,80}(c[aá]mara|grabaci[oó]n|testigo|v[ií]deo)/i.test(
        a
      ) ||
      /\b(la observaci[oó]n de la c[aá]mara|la grabaci[oó]n|el testigo)\b[^.!?\n]{0,60}\b(est[aá] confirmad|est[aá] verificad|es un hecho|queda probad)/i.test(
        a
      );
    if (factCamera) {
      issues.push({
        code: "unverified_as_fact",
        detail:
          "Se trata como hecho confirmado una cámara/grabación/testigo que en el enunciado solo aparece como afirmación.",
      });
    }
  }

  if (!/averiad|rota|no funciona|fuera de servicio/i.test(u)) {
    if (/c[aá]mara.{0,30}(averiad|rota|no funciona)|grabaci[oó]n.{0,30}(averiad|inexistente)/i.test(a)) {
      issues.push({
        code: "invented_detail",
        detail: "Se introduce un detalle (p. ej. cámara averiada) ausente del enunciado.",
      });
    }
  }

  return issues;
}

export function detectVersionBias(userText, assistantText) {
  const u = String(userText || "");
  const a = String(assistantText || "");
  if (!/versi[oó]n\s*a/i.test(u) || !/versi[oó]n\s*b/i.test(u)) return [];

  const factsBlock = a.match(/hechos?\s*[:：]([\s\S]{0,400}?)(?=\n\s*(?:indicios?|hip[oó]tesis|desconocido|an[aá]lisis|comprobaciones|respuesta)\s*[:：]|\n\n|$)/i);
  if (!factsBlock) return [];
  const facts = factsBlock[1] || "";
  const elevatesB =
    /(c[aá]mara|testigo|grabaci[oó]n|lo vi)/i.test(facts) &&
    !/(afirma|seg[uú]n|versi[oó]n\s*b|declaraci[oó]n|pendiente|sin corrobor)/i.test(facts);
  if (elevatesB) {
    return [
      {
        code: "version_bias",
        detail:
          "En Hechos se incluye material de una versión declarativa (cámara/testigo) sin marcarlo como no corroborado.",
      },
    ];
  }
  return [];
}

export function validateCaseFidelity(userText, assistantText) {
  const inventedNames = findInventedNames(userText, assistantText);
  const issues = [];

  if (inventedNames.length) {
    issues.push({
      code: "invented_names",
      detail: `Nombres no presentes en el enunciado: ${inventedNames.join(", ")}.`,
      names: inventedNames,
    });
  }
  issues.push(...detectUnverifiedAsFact(userText, assistantText));
  issues.push(...detectVersionBias(userText, assistantText));

  return { ok: issues.length === 0, issues, inventedNames };
}

export function buildFidelityCorrection(userText, assistantText, validation) {
  const lines = [];
  lines.push(
    "[Validación de fidelidad] La respuesta anterior no se ajusta del todo al enunciado:"
  );
  for (const iss of validation.issues) {
    lines.push(`- ${iss.detail}`);
  }
  lines.push("");
  lines.push(
    "Reformulación mínima (solo lo que el enunciado permite afirmar con rigor):"
  );
  lines.push("Hechos: lo explícitamente confirmado en el enunciado (p. ej. existencia de un cargo u hora si se indica). Nada más.");
  lines.push(
    "Indicios / declaraciones: cada versión es una afirmación pendiente de verificación, no una prueba independiente."
  );
  lines.push(
    "Desconocido: autoría, existencia real de grabaciones o testigos no examinados, y cualquier detalle no escrito en el caso."
  );
  lines.push(
    "Comprobaciones: contrastar ambas versiones con registros verificables (si existen), sin presuponer quién tenía o usó el medio de acceso."
  );
  if (/tarjeta|registro|cuenta/i.test(userText || "")) {
    lines.push(
      "Conclusión: un medio de acceso (tarjeta/registro/cuenta) no demuestra por sí solo quién lo utilizó."
    );
  }
  lines.push("");
  lines.push(
    "Nota: esta corrección es del validador de K.ENGINE, no una regeneración del modelo."
  );
  return lines.join("\n");
}

export function applyCaseFidelityGuard(raw, userText) {
  const validation = validateCaseFidelity(userText, raw);
  if (validation.ok) {
    return { text: raw, fidelity: { ok: true, issues: [] } };
  }
  const u = String(userText || "");
  const looksAnalytical =
    /versi[oó]n|hechos|indicios|hip[oó]tesis|tarjeta|prueba|evidencia|analiza|contradic/i.test(
      u
    ) || u.length > 120;
  if (!looksAnalytical) {
    return { text: raw, fidelity: { ok: true, issues: [], skipped: true } };
  }
  return {
    text: buildFidelityCorrection(userText, raw, validation),
    fidelity: { ok: false, issues: validation.issues, corrected: true },
  };
}
