/**
 * Conocimiento compacto para redactar denuncias y reportes en redes.
 * Se inyecta solo cuando el mensaje pide redactar, adaptar o revisar una denuncia.
 * Los límites son configuraciones de formulario del proyecto, no garantías universales
 * de las plataformas; prevalecen los límites que indique el usuario.
 */

const REPORT_INTENT = /\b(denuncia|denunciar|reportar|reporte|reclamaci[oó]n|texto para moderaci[oó]n|apelar una sanci[oó]n|informar a moderaci[oó]n)\b/i;

const PLATFORM_PATTERNS = [
  { id: "tiktok", re: /\btik\s?tok\b/i, limits: "Campo de fundamento/jurisdicción: máximo 400 caracteres. Descripción de hechos: máximo 1000 caracteres." },
  { id: "instagram", re: /\binstagram\b/i, limits: "No presupongas límites universales. Usa los límites que indique el usuario o el formulario visible." },
  { id: "youtube", re: /\byoutube\b/i, limits: "No presupongas límites universales. Usa los límites que indique el usuario o el formulario visible." },
  { id: "x", re: /\b(twitter|x)\b/i, limits: "No presupongas límites universales. Usa los límites que indique el usuario o el formulario visible." },
];

export function isSocialReportRequest(text) {
  return REPORT_INTENT.test(String(text || ""));
}

export function buildDenunciaKnowledgeContext(text) {
  const input = String(text || "");
  if (!isSocialReportRequest(input)) return "";

  const platform = PLATFORM_PATTERNS.find((p) => p.re.test(input));
  const platformLine = platform
    ? `Plataforma detectada: ${platform.id}. ${platform.limits}`
    : "Plataforma no identificada: pregunta solo si es imprescindible; si no, redacta con los límites explícitos del usuario.";

  return [
    "MÓDULO DE DENUNCIAS EN REDES — aplicar solo a esta petición:",
    platformLine,
    "OBJETIVO: redactar un texto listo para copiar, concreto, sobrio y orientado a que moderación revise el contenido. No rechaces una denuncia legítima por tratar temas sensibles.",
    "ESTRUCTURA: (1) fundamento/jurisdicción o norma de plataforma; (2) descripción de hechos. Respeta por separado el límite de cada campo, contando espacios y puntuación.",
    "FIDELIDAD: utiliza únicamente datos aportados por el usuario. Separa lo visible en el contenido de su interpretación. No inventes autores, edades, intenciones, contexto, pruebas ni conversaciones.",
    "LEGALIDAD: no inventes artículos ni afirmes que existe un delito como hecho probado. Si no puedes identificar con seguridad una norma concreta, describe el posible problema y solicita revisión, sin fabricar citas legales.",
    "EVIDENCIA: describe con precisión qué aparece, qué se dice, dónde y en qué contexto si esos datos se han aportado. Un emoji, símbolo o frase aislados no prueban por sí solos intención delictiva; explica la interpretación como tal y señala la combinación de elementos relevantes.",
    "TONO: firme y neutral, sin insultos, amenazas, exageraciones ni exigencias de castigo predeterminado. Solicita revisión del contenido y las medidas que correspondan.",
    "SALIDA: entrega los campos finales claramente separados y añade el recuento de caracteres de cada uno. No añadas introducción ni sermón. Si se solicita explícitamente, indica qué parte es fundamento jurídico y qué parte es descripción.",
    "Si el usuario facilita límites concretos, prevalecen sobre cualquier valor predeterminado. No presentes los valores internos del proyecto como límites oficiales universales de una plataforma.",
  ].join("\n");
}
