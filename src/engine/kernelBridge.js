/**
 * Puente KERNEL ↔ K.ENGINE (lado motor).
 *
 * Protocolo postMessage (ventana abierta por KERNEL):
 *   KERNEL → K.ENGINE  { type: "KERNEL_REQUEST", requestId, message }
 *   K.ENGINE → KERNEL  { type: "KENGINE_BRIDGE_READY", modelReady, model }
 *                      { type: "KENGINE_RESPONSE", requestId, response }
 *                      { type: "KENGINE_ERROR", requestId, error, code }
 *
 * Contrato HTTP (mismo deploy, api/ en Vercel):
 *   GET  /health  GET /models  POST /chat  GET /config
 *   Cliente en KERNEL: project-kernel-release-1-0-0 → src/lib/kengine-api-client.ts
 *
 * Repos:
 *   Motor:    https://github.com/tikitikitakataka639-prog/k-engine
 *   Interfaz: https://github.com/tikitikitakataka639-prog/project-kernel-release-1-0-0
 */

/** Orígenes KERNEL conocidos (postMessage targetOrigin). */
export const KERNEL_ALLOWED_ORIGINS = [
  // Release actual (GitHub / deploy)
  "https://project-kernel-release-1-0-0.lovable.app",
  "https://project-kernel-release-1-0-0.vercel.app",
  // Releases anteriores Lovable
  "https://project-kernel-release-0-6-0.lovable.app",
  "https://project-kernel-release-0-5-0.lovable.app",
  // Dominios genéricos del proyecto (ajusta si tienes dominio propio)
];

/**
 * Orígenes extra vía query ?kernelOrigin=https://...
 * Solo se aceptan https y se validan en isAllowedKernelOrigin.
 */
export function originsFromQuery() {
  try {
    const q = new URLSearchParams(window.location.search).get("kernelOrigin");
    if (!q) return [];
    const u = new URL(q);
    if (u.protocol !== "https:") return [];
    return [u.origin];
  } catch {
    return [];
  }
}

export function allAllowedOrigins() {
  const set = new Set([...KERNEL_ALLOWED_ORIGINS, ...originsFromQuery()]);
  // También el origin guardado en localStorage (si el usuario pegó URL KERNEL)
  try {
    const saved = localStorage.getItem("kernelUrl");
    if (saved) {
      const u = new URL(saved.includes("://") ? saved : `https://${saved}`);
      if (u.protocol === "https:") set.add(u.origin);
    }
  } catch {
    /* ignore */
  }
  return [...set];
}

export function isAllowedKernelOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  return allAllowedOrigins().includes(origin);
}

/** Origin al que responder: el del evento si es válido; si no, el primero de la lista. */
export function resolveKernelReplyOrigin(eventOrigin) {
  if (isAllowedKernelOrigin(eventOrigin)) return eventOrigin;
  const list = allAllowedOrigins();
  return list[0] || eventOrigin || "*";
}

/**
 * Envía un mensaje a KERNEL (opener). Intenta el origin del evento / lista.
 * postMessage exige un targetOrigin concreto (no "*") para seguridad.
 */
export function postToKernel(opener, payload, preferredOrigin) {
  if (!opener || opener.closed) return false;
  const targets = [];
  if (preferredOrigin && isAllowedKernelOrigin(preferredOrigin)) targets.push(preferredOrigin);
  for (const o of allAllowedOrigins()) {
    if (!targets.includes(o)) targets.push(o);
  }
  let ok = false;
  for (const origin of targets) {
    try {
      opener.postMessage(payload, origin);
      ok = true;
      // Un solo envío efectivo basta; el opener solo acepta su propio origin.
      // Enviamos a todos los permitidos por si el origin real no coincidía con el primero.
    } catch {
      /* origin no coincide o ventana cerrada */
    }
  }
  return ok;
}

export const BRIDGE_PROTOCOL = {
  request: "KERNEL_REQUEST",
  ready: "KENGINE_BRIDGE_READY",
  response: "KENGINE_RESPONSE",
  error: "KENGINE_ERROR",
};
