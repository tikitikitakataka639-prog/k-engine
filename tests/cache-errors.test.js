/**
 * Pruebas unitarias de clasificación de errores Cache.add / Cache.put.
 * Ejecutar: node tests/cache-errors.test.js
 * No requieren navegador, WebGPU ni red.
 */
import {
  isTransientStorageError,
  isTransientNetworkError,
  isTransientCacheError,
  isDefinitiveHttpStatus,
  classifyCacheFailure,
} from "../src/webllm/cache-errors.js";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  OK  " + msg);
  } else {
    failed++;
    console.error("  FAIL " + msg);
  }
}

console.log("=== isTransientStorageError ===");
assert(isTransientStorageError(new Error("Failed to execute 'put' on 'Cache': Unexpected internal error")), "unexpected internal error");
assert(isTransientStorageError(new Error("QuotaExceededError")), "QuotaExceededError message");
assert(isTransientStorageError({ name: "QuotaExceededError", message: "quota exceeded" }), "quota exceeded text");
assert(!isTransientStorageError(new Error("HTTP 404 definitivo")), "HTTP 404 no es storage transient");
assert(!isTransientStorageError(new Error("permission denied")), "permission denied no es transient");

console.log("=== isTransientNetworkError ===");
assert(isTransientNetworkError(new Error("Failed to execute 'add' on 'Cache': network error")), "network error");
assert(isTransientNetworkError(new Error("Failed to fetch")), "failed to fetch");
assert(isTransientNetworkError({ name: "TypeError", message: "NetworkError when attempting to fetch resource." }), "TypeError NetworkError");
assert(isTransientNetworkError(new Error("fetch failed")), "fetch failed");
assert(!isTransientNetworkError({ name: "AbortError", message: "The operation was aborted." }), "AbortError no se reintenta");
assert(!isTransientNetworkError(new Error("HTTP 403 Forbidden")), "403 no es network transient");

console.log("=== isTransientCacheError (unión) ===");
assert(isTransientCacheError(new Error("Unexpected internal error")), "storage via union");
assert(isTransientCacheError(new Error("network error")), "network via union");
assert(!isTransientCacheError({ name: "AbortError", message: "aborted" }), "abort via union");

console.log("=== isDefinitiveHttpStatus ===");
assert(isDefinitiveHttpStatus(404), "404");
assert(isDefinitiveHttpStatus(403), "403");
assert(isDefinitiveHttpStatus(500), "500");
assert(!isDefinitiveHttpStatus(200), "200");
assert(!isDefinitiveHttpStatus(0), "opaque 0");
assert(!isDefinitiveHttpStatus(null), "null");

console.log("=== classifyCacheFailure ===");
{
  const r = classifyCacheFailure(new Error("network error"), { attempt: 1, maxAttempts: 4 });
  assert(r.retry === true && r.reason === "network_transient", "network attempt 1 → retry");
}
{
  const r = classifyCacheFailure(new Error("network error"), { attempt: 4, maxAttempts: 4 });
  assert(r.retry === false && r.reason === "max_retries", "network attempt 4 → no retry");
}
{
  const r = classifyCacheFailure(new Error("Unexpected internal error"), { attempt: 2, maxAttempts: 4 });
  assert(r.retry === true && r.reason === "storage_transient", "storage attempt 2 → retry");
}
{
  const r = classifyCacheFailure({ name: "AbortError", message: "aborted" }, { attempt: 1 });
  assert(r.retry === false && r.reason === "abort", "abort → no retry");
}
{
  const r = classifyCacheFailure(new Error("[K.ENGINE] Cache.add: HTTP 404 definitivo. URL: x"), { phase: "http" });
  assert(r.retry === false && r.reason === "http_definitive", "HTTP definitivo → no retry");
}
{
  const r = classifyCacheFailure(new Error("something else permanently broken"), { attempt: 1 });
  assert(r.retry === false && r.reason === "persistent", "error desconocido → persistent");
}

console.log("\n--- Resultado: " + passed + " passed, " + failed + " failed ---");
if (failed > 0) process.exit(1);
