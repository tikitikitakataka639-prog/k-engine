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
 *   3. Filtro de salida: si el modelo aún suelta plantilla corporativa,
 *      la reescribe en voz KERNEL.
 *
 * Uso desde EngineProvider / worker:
 *   const { messages, maxTokens } = injectPersonality({
 *     systemPrompt,
 *     history,
 *     contextWindow,
 *     maxTokens,
 *   });
 */

import { getSystemPrompt } from "./personality.js";
import { buildFitMessages, estimateTokens } from "./chatContext.js";

/** Frases corporativas que el filtro de salida debe cazar y reescribir. */
const CORPORATE_PATTERNS = [
  /lo siento,?\s*pero\s*no\s*puedo/i,
  /no\s*puedo\s*proporcionar\s*informaci[oó]n/i,
  /no\s*puedo\s*ayudarte\s*con\s*eso/i,
  /como\s*ia\s*(no\s*)?(debo|puedo)/i,
  /te\s*recomiendo\s*contactar\s*con\s*organizaciones/i,
  /hay\s*recursos\s*y\s*organizaciones\s*que\s*pueden\s*ayudarte/i,
  /l[ií]nea\s*nacional\s*contra\s*el\s*tr[aá]fico/i,
  /organizaci[oó]n\s*mundial\s*de\s*la\s*salud\s*\(oms\)/i,
  /i('m| am)\s*sorry,?\s*but\s*i\s*can('t| not)/i,
  /as\s*an\s*ai\s*(language\s*)?model/i,
];

/** Few-shot mínimo: demuestra el tono correcto en preguntas de protección. */
const FEW_SHOT = [
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
      "No minimices. No es «solo un mensaje». Si ves indicios claros de captación sexual, prioriza protección y canales oficiales. Yo no denuncio por ti; te doy el mapa.",
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
 * En modelos ≤4096 solo metemos 1 par (protección + rechazo ilegal).
 */
function selectFewShot(budgetTokens) {
  const fullCost = FEW_SHOT.reduce((n, m) => n + estimateTokens(m.content) + 6, 0);
  if (budgetTokens >= fullCost + 200) return FEW_SHOT;
  // Solo el par de rechazo ilegal (más corto) + versión condensada de protección
  return [
    {
      role: "user",
      content: "¿Qué hago si un adulto escribe a mi hija en una red?",
    },
    {
      role: "assistant",
      content:
        "Capturas → bloquea → denuncia en la plataforma → si hay tono sexual o pide encuentro, valora policía/Guardia Civil (posible grooming art. 183 CP). Habla con ella. Prioriza protección.",
    },
    FEW_SHOT[2],
    FEW_SHOT[3],
  ];
}

/**
 * Construye el array de mensajes listo para el motor.
 * @param {object} opts
 * @param {string} [opts.systemPrompt] — si no se pasa, se obtiene de getSystemPrompt
 * @param {string} [opts.modelId]
 * @param {number} [opts.contextWindow]
 * @param {Array<{role:string,content:string}>} opts.history
 * @param {number} [opts.maxTokens]
 * @param {boolean} [opts.includeFewShot=true]
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
  const system =
    systemPrompt ||
    getSystemPrompt(modelId, ctx);

  // Reservar espacio para few-shot si cabe
  let few = [];
  if (includeFewShot) {
    const sysTok = estimateTokens(system);
    const replyBudget = Math.min(512, Math.floor(ctx * 0.3));
    const available = ctx - 80 - sysTok - replyBudget;
    few = selectFewShot(Math.max(0, available));
  }

  // Historial real del usuario + few-shot delante (el modelo ve el ejemplo primero)
  const augmentedHistory = [...few, ...(history || [])];

  return buildFitMessages({
    systemPrompt: system,
    history: augmentedHistory,
    contextWindow: ctx,
    maxTokens,
  });
}

/**
 * Filtro de salida: si el texto generado es claramente una plantilla corporativa,
 * lo sustituye por una respuesta KERNEL mínima.
 * No se aplica a respuestas largas y útiles (solo a refusals cortos).
 */
export function sanitizeCorporateRefusal(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 900) return t; // respuestas largas las dejamos

  const isCorporate = CORPORATE_PATTERNS.some((re) => re.test(t));
  if (!isCorporate) return t;

  // Reescritura mínima en voz KERNEL
  return (
    "Esa respuesta de «lo siento, no puedo» es basura corporativa y aquí no vale.\n\n" +
    "Si estás preguntando cómo proteger a un menor o qué dice la ley: dilo claro y te doy pasos concretos (capturas, bloqueo, denuncia en la red, autoridades si hace falta).\n\n" +
    "Si estás pidiendo ayuda para cometer un delito: qué dices, bro. Ni de coña."
  );
}

/**
 * Aplica el filtro de salida a un stream de tokens (opcional, para uso futuro).
 * Por ahora se usa al final de la generación en el main thread.
 */
export function finalizeAssistantText(raw) {
  return sanitizeCorporateRefusal(raw);
}
