/**
 * Conocimiento compacto para redactar denuncias y reportes en redes.
 * Se inyecta solo cuando el mensaje pide redactar, adaptar o revisar una denuncia.
 * Los límites son configuraciones de formulario del proyecto, no garantías universales
 * de las plataformas; prevalecen los límites que indique el usuario.
 */

const REPORT_INTENT = /\b(denuncia|denunciar|reportar|reporte|borrador|apartados?|polic[ií]a|reclamaci[oó]n|texto para moderaci[oó]n|apelar una sanci[oó]n|informar a moderaci[oó]n)\b/i;
const ANALYSIS_ACTION = /\b(analiza|an[aá]lisis|interpreta|identifica|detecta|documenta|revisa|eval[uú]a|explica|qu[eé]\s+significa)\b/i;
const SENSITIVE_LANGUAGE =
  /\b(grooming|captaci[oó]n|lenguaje\s+codificado|eufemismo|eufemismos|ret[oó]rica\s+map|map|pro[\s-]?contacto|minimizaci[oó]n\s+(?:del\s+)?abuso|normaliza(?:ci[oó]n)?\s+(?:del\s+)?abuso)\b/i;
const SENSITIVE_REPORT_TOPIC =
  /\b(cp|csam|abuso\s+infantil|telegram|grooming|map|grupo|canal|material\s+ilegal)\b/i;
const REPORT_ACTION_OR_STRUCTURE =
  /\b(apartados?|desconocido|redacta|redactar|borrador|denuncia|denunciar|reporta|reportar|documenta|documentar)\b|\[desconocido\]/i;

const PLATFORM_PATTERNS = [
  { id: "tiktok", re: /\btik\s?tok\b/i, limits: "Campo de fundamento/jurisdicción: máximo 400 caracteres. Descripción de hechos: máximo 1000 caracteres." },
  { id: "instagram", re: /\binstagram\b/i, limits: "No presupongas límites universales. Usa los límites que indique el usuario o el formulario visible." },
  { id: "youtube", re: /\byoutube\b/i, limits: "No presupongas límites universales. Usa los límites que indique el usuario o el formulario visible." },
  { id: "x", re: /\b(twitter|x)\b/i, limits: "No presupongas límites universales. Usa los límites que indique el usuario o el formulario visible." },
];

export function isSocialReportRequest(text) {
  const input = String(text || "");
  return (
    REPORT_INTENT.test(input) ||
    (ANALYSIS_ACTION.test(input) && SENSITIVE_LANGUAGE.test(input)) ||
    (SENSITIVE_REPORT_TOPIC.test(input) && REPORT_ACTION_OR_STRUCTURE.test(input))
  );
}

export function buildMinimalReportDraft(userText) {
  const input = String(userText || "");
  const mentioned = [];
  if (/\bcp\b/i.test(input)) mentioned.push("CP");
  if (/\bcsam\b/i.test(input)) mentioned.push("CSAM");
  if (/\babuso\s+infantil\b/i.test(input)) mentioned.push("abuso infantil");
  if (/\btelegram\b/i.test(input)) mentioned.push("Telegram");
  if (/\bgrooming\b/i.test(input)) mentioned.push("grooming");
  if (/\bmap\b/i.test(input)) mentioned.push("MAP");
  if (/\bgrupo\b/i.test(input)) mentioned.push("grupo");
  if (/\bcanal\b/i.test(input)) mentioned.push("canal");

  const facts = mentioned.length
    ? `El mensaje aportado menciona: ${mentioned.map((term) => `«${term}»`).join(", ")}.`
    : "El mensaje no aporta hechos concretos adicionales.";

  return [
    "Hechos aportados",
    facts,
    "",
    "Indicios e hipótesis",
    "La mención por sí sola no permite confirmar la naturaleza, el contexto ni la legalidad del contenido; requiere valoración.",
    "",
    "Datos [DESCONOCIDO]",
    "Identidades, fecha, enlace, contenido concreto, procedencia y demás circunstancias: [DESCONOCIDO].",
    "",
    "Solicitud",
    "Solicito que la autoridad competente revise la información aportada y determine las actuaciones procedentes.",
  ].join("\n");
}

export function buildDenunciaKnowledgeContext(text) {
  const input = String(text || "");
  if (!isSocialReportRequest(input)) return "";

  const platform = PLATFORM_PATTERNS.find((p) => p.re.test(input));
  const platformLine = platform
    ? `Plataforma detectada: ${platform.id}. ${platform.limits}`
    : "Plataforma no identificada: pregunta solo si es imprescindible; si no, redacta con los límites explícitos del usuario.";

  return [
    "MÓDULO DE DENUNCIAS Y ANÁLISIS DE CAPTACIÓN — aplicar solo a esta petición:",
    platformLine,
    "OBJETIVO: redactar un borrador policial o de plataforma, o analizar indicios lingüísticos para documentarlos. El fin es prevenir y denunciar, nunca imitar, facilitar ni normalizar el abuso.",
    "INDICIOS DE ALTO NIVEL: secreto o aislamiento, traslado a canales privados, pruebas de límites, presión o manipulación, regalos/favores ligados a confidencialidad, sexualización de la conversación, petición de material privado y argumentos que minimizan el daño o la diferencia de edad/poder.",
    "LECTURA PRUDENTE: expresiones como «relación especial», «es suficientemente maduro», «si hay consentimiento» o «no hace daño a nadie» pueden funcionar como eufemismos o minimización según el contexto. Presenta siempre esa lectura como hipótesis interpretativa, nunca como hecho ni prueba; la sigla MAP o una postura declarada tampoco prueba por sí sola una conducta.",
    "ESTRUCTURA: como máximo cuatro apartados, una sola vez cada uno: Hechos aportados; Indicios e hipótesis; Datos [DESCONOCIDO]; Solicitud. En formulario de plataforma, adapta los encabezados a sus campos. No repitas puntos ni añadas apartados vacíos.",
    "FIDELIDAD: usa solo datos aportados por el usuario. No inventes fechas, nombres o títulos de grupos, URLs, autores, edades, intenciones, contextos, conversaciones, escenas ni evidencias. No conviertas «material en un grupo» en audio, imagen, vídeo o archivo concreto. Si un dato necesario no consta, escribe [DESCONOCIDO]. Separa hechos observados, afirmaciones e interpretación.",
    "LEGALIDAD: No inventes artículos ni afirmes que existe un delito como hecho probado. Si no puedes identificar con seguridad una norma concreta, describe el posible problema y solicita revisión, sin fabricar citas legales.",
    "EVIDENCIA: describe solo qué aparece, qué se dice, dónde y en qué contexto cuando el usuario lo haya aportado. Una frase aislada no demuestra intención delictiva; indica qué corroboración falta.",
    "TONO Y SALIDA: neutral, concreto y sin conclusión penal cerrada. Solicita valoración/investigación por la autoridad o moderación competente. Entrega el borrador directamente; añade recuento de caracteres solo si el formulario o el usuario lo requiere.",
    "Si el usuario facilita límites concretos, prevalecen sobre cualquier valor predeterminado. No presentes los valores internos del proyecto como límites oficiales universales de una plataforma.",
  ].join("\n");
}
