/**
 * Ajusta system + historial al context window del modelo (p.ej. 4096).
 * Estimación conservadora para español/WebLLM: ~2,5 caracteres por token.
 */

const CHARS_PER_TOKEN = 2.5;
/** Margen por plantillas de chat, roles, etc. */
const SAFETY_TOKENS = 64;
/** Reserva mínima para la respuesta del modelo. */
const MIN_REPLY_TOKENS = 256;

export function estimateTokens(text) {
  const s = String(text || "");
  if (!s) return 0;
  return Math.ceil(s.length / CHARS_PER_TOKEN);
}

/**
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {Array<{role:string,content:string}>} opts.history mensajes ya con el user actual al final
 * @param {number|null|undefined} opts.contextWindow tamaño de contexto del modelo
 * @param {number} [opts.maxTokens] tokens de salida deseados
 * @returns {{ messages: Array<{role:string,content:string}>, maxTokens: number, contextWindow: number, truncated: boolean }}
 */
export function buildFitMessages({ systemPrompt, history, contextWindow, maxTokens = 512 }) {
  const ctx = Math.max(512, Number(contextWindow) || 4096);
  let replyBudget = Math.min(Math.max(MIN_REPLY_TOKENS, Number(maxTokens) || 512), Math.floor(ctx * 0.35));
  let budget = ctx - SAFETY_TOKENS - replyBudget;

  let system = String(systemPrompt || "").trim();
  let sysTok = estimateTokens(system);

  // Si el system solo ya no cabe, recortar por el final (mantener identidad al inicio).
  if (sysTok > Math.floor(budget * 0.55)) {
    const maxChars = Math.floor(budget * 0.55 * CHARS_PER_TOKEN);
    system = system.slice(0, Math.max(200, maxChars - 20)).trim() + "\n[…]";
    sysTok = estimateTokens(system);
  }

  budget -= sysTok;
  if (budget < 64) {
    replyBudget = Math.min(replyBudget, Math.max(128, ctx - SAFETY_TOKENS - sysTok - 32));
    const last = (history || []).filter((m) => m && m.content).slice(-1);
    return {
      messages: [{ role: "system", content: system }, ...last.map((m) => ({ role: m.role, content: String(m.content).slice(0, 800) }))],
      maxTokens: replyBudget,
      contextWindow: ctx,
      truncated: true,
    };
  }

  const cleaned = (history || [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim() }));

  const picked = [];
  let used = 0;
  let truncated = system.length < String(systemPrompt || "").trim().length;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let content = cleaned[i].content;
    let t = estimateTokens(content) + 4;
    if (used + t > budget) {
      if (picked.length === 0) {
        const maxChars = Math.max(120, Math.floor((budget - used - 4) * CHARS_PER_TOKEN));
        content = content.slice(0, maxChars) + (content.length > maxChars ? "…" : "");
        t = estimateTokens(content) + 4;
        if (t <= budget - used) {
          picked.unshift({ role: cleaned[i].role, content });
          used += t;
          truncated = true;
        }
      } else {
        truncated = true;
      }
      break;
    }
    picked.unshift({ role: cleaned[i].role, content });
    used += t;
  }

  return {
    messages: [{ role: "system", content: system }, ...picked],
    maxTokens: replyBudget,
    contextWindow: ctx,
    truncated,
  };
}
