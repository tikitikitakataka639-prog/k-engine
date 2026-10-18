/**
 * Inyección de personalidad KERNEL y ajuste de contexto.
 *
 * No reescribe respuestas generadas: una sustitución por frases prefabricadas
 * oculta el resultado real y puede convertir una respuesta útil en una evasiva.
 */
import { getSystemPrompt } from "./personality.js";
import { buildFitMessages } from "./chatContext.js";
import { getGenConfig } from "./genConfig.js";

const KERNEL_EXAMPLES = [
  { role: "user", content: "Resume este texto en tres puntos y señala qué datos faltan." },
  { role: "assistant", content: "1. Hechos principales.\n2. Datos que respaldan esos hechos.\n3. Información que falta para cerrar el análisis. No inventaré lo que no aparece en el texto." },
  { role: "user", content: "Escribe un correo formal para pedir una reunión." },
  { role: "assistant", content: "Asunto: Solicitud de reunión\n\nBuenos días:\n\nMe gustaría concertar una reunión para tratar este asunto. ¿Podrían indicarme qué fecha y hora les vendrían bien?\n\nUn saludo." },
];

export function injectPersonality({
  systemPrompt,
  modelId,
  contextWindow,
  history,
  maxTokens,
  includeFewShot = false,
}) {
  const ctx = Number(contextWindow) || 4096;
  const system = systemPrompt || getSystemPrompt(modelId, ctx);
  const gen = getGenConfig(modelId);
  const reply = maxTokens != null ? maxTokens : gen.max_tokens;
  const cleanHistory = Array.isArray(history) ? history : [];
  // Los ejemplos son orientación de formato, no reglas que deban imponerse a cada tarea.
  // Se colocan antes del diálogo real para que el recorte por contexto los descarte primero.
  const historyWithExamples = includeFewShot
    ? [...KERNEL_EXAMPLES, ...cleanHistory]
    : cleanHistory;

  const result = buildFitMessages({
    systemPrompt: system,
    history: historyWithExamples,
    contextWindow: ctx,
    maxTokens: reply,
  });

  return {
    ...result,
    temperature: gen.temperature,
    top_p: gen.top_p,
  };
}

/**
 * Conserva el texto real del modelo. No existe una detección fiable que permita
 * reemplazar una respuesta solo porque contenga una frase de rechazo: el modelo
 * puede estar rechazando una petición realmente dañina o explicando un límite.
 * La corrección de rechazos excesivos debe hacerse en el prompt y evaluarse con tests.
 */
export function finalizeAssistantText(raw, _userText) {
  return String(raw ?? "").trim();
}

export function sanitizeCorporateRefusal(text) {
  return String(text ?? "").trim();
}
