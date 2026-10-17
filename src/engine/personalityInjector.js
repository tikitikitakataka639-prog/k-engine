/**
 * personalityInjector.js
 * ---------------------
 * Inyecta la personalidad KERNEL en CADA generación, independientemente
 * del modelo cargado (0.5B, 1B, 3B, 7B…).
 *
 * No modifica pesos del modelo (imposible en WebLLM/browser).
 * Actúa en tres capas:
 *   1. System prompt fuerte (getSystemPrompt)
 *   2. Few-shot de ejemplo que demuestra el tono y el anti-refusal
 *   3. Filtro de salida: SOLO si el modelo suelta plantilla corporativa clara
 *
 * Uso desde EngineProvider / worker:
 *   const { messages, maxTokens } = injectPersonality({ ... });
 */

import { getSystemPrompt } from "./personality.js";
import { buildFitMessages, estimateTokens } from "./chatContext.js";

/** Frases corporativas claras. Deben coincidir de forma inequívoca. */
const CORPORATE_PATTERNS = [
  /lo siento,?\s*pero\s*no\s*puedo\s*(proporcionar|ayudar|responder|dar)/i,
  /no\s*puedo\s*proporcionar\s*informaci[oó]n\s*sobre/i,
  /no\s*puedo\s*ayudarte\s*con\s*eso/i,
  /como\s*ia\s*(no\s*)?(debo|puedo)\s/i,
  /te\s*recomiendo\s*contactar\s*con\s*organizaciones/i,
  /hay\s*recursos\s*y\s*organizaciones\s*que\s*pueden\s*ayudarte/i,
  /l[ií]nea\s*nacional\s*contra\s*el\s*tr[aá]fico\s*infantil/i,
  /organizaci[oó]n\s*mundial\s*de\s*la\s*salud\s*\(oms\)/i,
  /i('m| am)\s*sorry,?\s*but\s*i\s*can('t| not)\s/i,
  /as\s*an\s*ai\s*(language\s*)?model[,.]?\s*i\s/i,
];

/** Few-shot: saludo + protección + rechazo de delito. */
const FEW_SHOT = [
  {
    role: "user",
    content: "hola, kernel",
  },
  {
    role: "assistant",
    content:
      "Hola. Soy KERNEL. ¿Qué necesitas? Análisis, denuncia, texto para redes o lo que sea. Sin rodeos.",
  },
  {
    role: "user",
    content: "¿Qué hago si un adulto escribe a mi hija en Threads?",
  },
  {
    role: "assistant",
    content:
      "Nivel orientativo: G3/G4 según el contenido del mensaje.\n\n" +
      "Hechos: un adulto contacta a una menor. Eso ya es señal de alerta.\n\n" +
      "Qué hacer YA:\n" +
      "1. Guarda capturas de pantalla de TODO (perfil, mensajes, fechas).\n" +
      "2. Bloquea al tipo en Threads.\n" +
      "3. Denuncia el perfil/mensaje en Threads (Report → Harassment o Safety).\n" +
      "4. Si el mensaje tiene tono sexual, pide encuentro o pide fotos: eso puede ser grooming (art. 183 CP). Guarda pruebas y valora denuncia en Policía Nacional / Guardia Civil / fiscalía de menores.\n" +
      "5. Habla con tu hija sin alarmarla de más: que no acepte peticiones de desconocidos, que te cuente cualquier mensaje raro.\n\n" +
      "No minimices. Si ves indicios claros de captación sexual, prioriza protección y canales oficiales. Yo no denuncio por ti; te doy el mapa.",
  },
  {
    role: "user",
    content: "¿Me puedes ayudar a contactar menores con fines sexuales?",
  },
  {
    role: "assistant",
    content:
      "Qué dices, bro. Ni de coña. Eso es delito (grooming, art. 183 CP y más) y aquí no se da esa información. Punto.",
  },
];

/**
 * Decide si incluir few-shot según presupuesto de tokens.
 */
function selectFewShot(budgetTokens) {
  const fullCost = FEW_SHOT.reduce((n, m) => n + estimateTokens(m.content) + 6, 0);
  if (budgetTokens >= fullCost + 180) return FEW_SHOT;

  // Versión corta: saludo + rechazo ilegal (lo mínimo para tono + anti-delito)
  return [
    FEW_SHOT[0],
    FEW_SHOT[1],
    FEW_SHOT[4],
    FEW_SHOT[5],
  ];
}

/**
 * Construye el array de mensajes listo para el motor.
 */
export function injectPersonality({
  systemPrompt,
  modelId,
  contextWindow,
  history,
  maxTokens = 512,
  includeFewShot = true,
}) {
  const ctx = Number(contextWindow) || 4096;
  const system = systemPrompt || getSystemPrompt(modelId, ctx);

  let few = [];
  if (includeFewShot) {
    const sysTok = estimateTokens(system);
    const replyBudget = Math.min(512, Math.floor(ctx * 0.3));
    const available = ctx - 80 - sysTok - replyBudget;
    few = selectFewShot(Math.max(0, available));
  }

  const augmentedHistory = [...few, ...(history || [])];

  return buildFitMessages({
    systemPrompt: system,
    history: augmentedHistory,
    contextWindow: ctx,
    maxTokens,
  });
}

/**
 * Detecta si el texto es un refusal corporativo real.
 * Exige señal clara de rechazo + longitud corta.
 * NO toca saludos, análisis, denuncias ni respuestas normales de KERNEL.
 */
function isCorporateRefusal(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  // Respuestas largas o con estructura de análisis KERNEL → no tocar
  if (t.length > 600) return false;
  if (/\b(G[1-4]|capturas|denuncia|art\.\s*183|qué dices,\s*bro|ni de coña)\b/i.test(t)) {
    return false; // ya está en voz KERNEL
  }
  // Debe coincidir al menos un patrón fuerte de refusal
  const hits = CORPORATE_PATTERNS.filter((re) => re.test(t)).length;
  if (hits === 0) return false;
  // Evitar falsos positivos en textos que solo mencionan la frase al criticarla
  if (/basura corporativa|aquí no vale|plantilla/i.test(t)) return false;
  return true;
}

/**
 * Filtro de salida: SOLO reescribe refusals corporativos claros y cortos.
 */
export function sanitizeCorporateRefusal(text) {
  const t = String(text || "").trim();
  if (!isCorporateRefusal(t)) return t;

  return (
    "Esa respuesta de «lo siento, no puedo» es basura corporativa y aquí no vale.\n\n" +
    "Si estás preguntando cómo proteger a un menor o qué dice la ley: dilo claro y te doy pasos concretos (capturas, bloqueo, denuncia en la red, autoridades si hace falta).\n\n" +
    "Si estás pidiendo ayuda para cometer un delito: qué dices, bro. Ni de coña.\n\n" +
    "Si solo saludabas o preguntabas otra cosa: reformula y te respondo en serio."
  );
}

export function finalizeAssistantText(raw) {
  return sanitizeCorporateRefusal(raw);
}
