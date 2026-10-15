/**
 * Clasificación de errores de Cache API / red para los interceptores de K.ENGINE.
 * Módulo puro (sin DOM) para poder unit-testear sin navegador.
 */

export function isTransientStorageError(err) {
  const msg = String((err && err.message) || err || "").toLowerCase();
  return (
    msg.includes("unexpected internal error") ||
    msg.includes("quotaexceeded") ||
    msg.includes("quota exceeded") ||
    msg.includes("internal error") ||
    msg.includes("unknown error")
  );
}

export function isTransientNetworkError(err) {
  const msg = String((err && err.message) || err || "").toLowerCase();
  const name = String((err && err.name) || "").toLowerCase();
  if (name === "aborterror") return false;
  return (
    msg.includes("network error") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("fetch failed") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    (name === "typeerror" && (msg.includes("network") || msg.includes("fetch")))
  );
}

export function isTransientCacheError(err) {
  return isTransientStorageError(err) || isTransientNetworkError(err);
}

/** HTTP definitivos: no reintentar ni almacenar. */
export function isDefinitiveHttpStatus(status) {
  return typeof status === "number" && status !== 0 && (status < 200 || status >= 300);
}

/**
 * Decide si un fallo de add/put debe reintentarse.
 * @returns {{ retry: boolean, reason: string }}
 */
export function classifyCacheFailure(err, { phase = "unknown", attempt = 1, maxAttempts = 4 } = {}) {
  if (err && err.name === "AbortError") {
    return { retry: false, reason: "abort" };
  }
  if (phase === "http" || (err && /HTTP \d{3} definitivo/i.test(String(err.message || "")))) {
    return { retry: false, reason: "http_definitive" };
  }
  if (isTransientNetworkError(err) || isTransientStorageError(err)) {
    if (attempt >= maxAttempts) return { retry: false, reason: "max_retries" };
    return { retry: true, reason: isTransientNetworkError(err) ? "network_transient" : "storage_transient" };
  }
  return { retry: false, reason: "persistent" };
}
