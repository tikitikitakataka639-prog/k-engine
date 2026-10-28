/**
 * evidenceFidelity.js
 * Validador determinista de fidelidad al caso (post-inferencia).
 * Conservador: solo marca nombres cuando aparecen como sujeto de una
 * declaración atribuida; evita confundir títulos y palabras capitalizadas
 * al inicio de una frase con nombres propios.
 */

export function extractProperNameCandidates(text) {
  const t = String(text || "");
  const found = new Set();

  // A candidate must be directly attributed an action or statement.
  // This intentionally prefers missed edge cases over false positives such as
  // "Recibí", "Reformulación" or headings at the start of a sentence.
  const re =
    /(?:^|[\s«"'([{,;:])([A-ZÁÉÍÓÚÑ][a-záéíóúñü]{1,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{1,}){0,2})(?=\s+(?:dice|afirma|sostiene|declara|asegura|reconoce|niega|cuenta|cont[oó]|explica|responde|escribe|env[ií]a|recibi[oó]|denuncia|relata|mantiene|admite|a[ñn]ade|se[ñn]ala|indica|confirma|alega|ofrece)\b)/gm;
  let m;
  while ((m = re.exec(t)) !== null) {
    const candidate = m[1].trim();
    // Reject common role nouns that can precede a reporting verb.
    if (/^(?:la persona|el usuario|la usuaria|el autor|la autora|el testigo|la testigo|una persona|alguien)$/i.test(candidate)) continue;
    for (const part of candidate.split(/\s+/)) found.add(part);
    if (candidate.includes(" ")) found.add(candidate);
  }

  // Also recognize explicit attributions in compact formats: "Nombre: ...".
  const labelRe = /(?:^|\n)\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñü]{1,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]{1,}){0,2})\s*:\s*(?:afirma|dice|declara|sostiene|asegura)\b/gm;
  while ((m = labelRe.exec(t)) !== null) {
    const candidate = m[1].trim();
    for (const part of candidate.split(/\s+/)) found.add(part);
    if (candidate.includes(" ")) found.add(candidate);
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

export function detectUnsupportedReportDetails(userText, assistantText) {
  const u = String(userText || "").toLowerCase();
  const a = String(assistantText || "");
  const issues = [];

  const unsupportedPatterns = [
    {
      code: "unsupported_date",
      re: /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+\d{4})\b/gi,
      label: "una fecha",
    },
    {
      code: "unsupported_url",
      re: /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi,
      label: "una URL",
    },
    {
      code: "unsupported_evidence_modality",
      re: /\b(?:audios?|im[aá]genes?|fotos?|fotograf[ií]as?|v[ií]deos?|videos?|capturas de pantalla)\b/gi,
      label: "una modalidad concreta de evidencia (audio/imagen/vídeo)",
    },
  ];

  for (const { code, re, label } of unsupportedPatterns) {
    const matches = [...a.matchAll(re)];
    const unsupported = matches.some((match) => {
      if (u.includes(match[0].toLowerCase())) return false;
      if (code !== "unsupported_evidence_modality") return true;
      const start = Math.max(a.lastIndexOf(".", match.index), a.lastIndexOf("\n", match.index)) + 1;
      const endCandidates = [a.indexOf(".", match.index), a.indexOf("\n", match.index)].filter((i) => i >= 0);
      const end = endCandidates.length ? Math.min(...endCandidates) : a.length;
      const sentence = a.slice(start, end);
      return !/(?:no\s+(?:consta|se\s+sabe|se\s+indic[oó]|se\s+aport[oó]|hay)|desconocid[oa]|sin\s+(?:especificar|indicar|aportar)|si\s+(?:existe|hay)|\[DESCONOCIDO\])/i.test(sentence);
    });
    if (unsupported) {
      issues.push({
        code,
        detail: `La respuesta añade ${label} no aportada por el usuario; sustitúyela por [DESCONOCIDO] o elimínala.`,
      });
    }
  }

  const namedGroups = [
    ...a.matchAll(/\b(?:grupo|canal)\s+(?:de\s+telegram\s+)?(?:llamado|denominado|titulado|conocido\s+como)\s+["«]?([^"»\n,.;]{2,60})/gi),
    ...a.matchAll(/\b(?:grupo|canal)\s+["«]([^"»\n]{2,60})["»]/gi),
  ].map((match) => match[1].trim());
  if (namedGroups.some((name) => name !== "[DESCONOCIDO]" && !u.toLowerCase().includes(name.toLowerCase()))) {
    issues.push({
      code: "unsupported_group_name",
      detail: "La respuesta atribuye un nombre a un grupo/canal que el usuario no aportó; sustitúyelo por [DESCONOCIDO] o elimínalo.",
    });
  }

  const analysisRequest =
    /\b(?:grooming|captaci[oó]n|eufemismo|lenguaje\s+codificado|map|pro[\s-]?contacto)\b/i.test(u);
  if (analysisRequest) {
    const claims = [
      ...a.matchAll(/\b(?:es|significa|demuestra|confirma)\s+(?:claramente\s+)?(?:grooming|captaci[oó]n|abuso|intenci[oó]n\s+de\s+captar)\b/gi),
    ];
    const unqualified = claims.some((match) => {
      const sentenceStart = Math.max(a.lastIndexOf(".", match.index), a.lastIndexOf("\n", match.index)) + 1;
      const prefix = a.slice(sentenceStart, match.index);
      return !/\b(?:posible|podr[ií]a|podr[ií]an|hip[oó]tesis|indicio|compatible\s+con|parece)\b/i.test(prefix);
    });
    if (unqualified) {
      issues.push({
        code: "unqualified_interpretation",
        detail: "La interpretación del lenguaje debe presentarse como hipótesis o posible indicio, no como una conclusión probada.",
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
      detail: `Posibles nombres propios no presentes en el enunciado: ${inventedNames.join(", ")}.`,
      names: inventedNames,
    });
  }
  issues.push(...detectUnverifiedAsFact(userText, assistantText));
  issues.push(...detectUnsupportedReportDetails(userText, assistantText));
  issues.push(...detectVersionBias(userText, assistantText));

  return { ok: issues.length === 0, issues, inventedNames };
}

export function buildFidelityCorrection(userText, assistantText, validation) {
  const lines = [
    "[Validación de fidelidad] Se han detectado posibles problemas de fidelidad:",
    ...validation.issues.map((iss) => `- ${iss.detail}`),
    "",
    "Se conserva la respuesta original para evitar sustituirla por una plantilla genérica no sustentada.",
    "Corrige los datos no aportados usando [DESCONOCIDO] o elimínalos antes de utilizar el borrador.",
    "",
    "Respuesta original:",
    String(assistantText || ""),
    "",
    "Nota: esta advertencia procede del validador de K.ENGINE; no es una regeneración del modelo.",
  ];
  return lines.join("\n");
}

export function applyCaseFidelityGuard(raw, userText) {
  const u = String(userText || "");
  const analyticalSignals =
    /versi[oó]n|hechos|indicios|hip[oó]tesis|tarjeta|prueba|evidencia|analiza|contradic|testigo|c[aá]mara|grabaci[oó]n|declaraci[oó]n|investigaci[oó]n|corrobor|autor[ií]a|denuncia|report(?:e|ar)|grooming|captaci[oó]n|eufemismo|lenguaje\s+codificado|\bmap\b|pro[\s-]?contacto/i.test(
      u
    );

  // Do not run a case-analysis correction on every long user message.
  if (!analyticalSignals) {
    return { text: raw, fidelity: { ok: true, issues: [], skipped: true } };
  }

  const validation = validateCaseFidelity(u, raw);
  if (validation.ok) {
    return { text: raw, fidelity: { ok: true, issues: [] } };
  }

  return {
    text: buildFidelityCorrection(u, raw, validation),
    fidelity: { ok: false, issues: validation.issues, corrected: true, preservedOriginal: true },
  };
}
