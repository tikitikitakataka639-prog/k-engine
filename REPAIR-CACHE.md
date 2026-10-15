# K.ENGINE — Reparación Cache.add / Cache.put

## Causa raíz

`@mlc-ai/web-llm@0.2.79` descarga pesos mediante `ArtifactCache.addToCache()`:

```js
yield this.cache.add(request);  // Cache API nativa
```

Según la especificación, `Cache.add(request)` = `fetch(request)` + `Cache.put(request, response)`.

El interceptor anterior **solo parcheaba `Cache.prototype.put`**. Por tanto:

| Error observado | Fase real | Cubierto por put-only |
|-----------------|-----------|------------------------|
| `Failed to execute 'add' on 'Cache': network error` | fetch interno de `add` | **No** |
| `Failed to execute 'add' on 'Cache': Unexpected internal error` | put interno o fallo de `add` reportado como tal | Parcial |
| `Cache.put() Unexpected internal error` | escritura Cache Storage | Sí (reintentos) |

Los cuatro modelos destacados (1B, 0.5B, 1.5B, 3B) usan el mismo camino `webllm/model` → todos afectados.

## Solución implementada

1. **`Cache.prototype.add` reimplementado de forma controlada**
   - `match` previo → si ya está en caché, no re-descarga.
   - `fetch` con hasta 4 reintentos y backoff solo para errores de red transitorios.
   - Rechazo inmediato de HTTP 4xx/5xx (no se almacenan respuestas fallidas).
   - Respeta `AbortSignal` (cancelación no se reintenta).
   - Escritura vía `this.put` (ya parcheado).

2. **`Cache.prototype.put` (conservado y unificado)**
   - Diagnóstico con `navigator.storage.estimate()`.
   - Content-Length en logs.
   - Clone correcto de la Response.
   - Reintentos solo para errores de almacenamiento transitorios.
   - No éxito ficticio.

3. **`Cache.prototype.addAll`** secuencial (evita saturar red/cuota).

4. **Módulo puro `src/webllm/cache-errors.js`** con clasificación de errores + tests unitarios.

5. **ModelManager** ampliado para mostrar fases `CACHE_ADD_*` en consola y texto de progreso.

## Archivos modificados / añadidos

| Archivo | Cambio |
|---------|--------|
| `src/webllm/kengine-worker.js` | Interceptores `add` + `put` + `addAll` |
| `src/webllm/cache-errors.js` | **Nuevo** — clasificación pura |
| `src/engine/modelManager.js` | Manejo de fases `CACHE_ADD_*` |
| `tests/cache-errors.test.js` | **Nuevo** — 26 aserciones |
| `package.json` | Scripts `test` / `test:cache` |
| `REPAIR-CACHE.md` | Este informe |

## Modelos verificados (prebuiltAppConfig 0.2.79)

- `Llama-3.2-1B-Instruct-q4f16_1-MLC` → OK
- `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` → OK
- `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` → OK
- `Llama-3.2-3B-Instruct-q4f16_1-MLC` → OK

Sin cambio de IDs, cuantización, versión de WebLLM ni CDN.

## Pruebas ejecutadas

### Automatizadas (sin navegador)

```bash
node tests/cache-errors.test.js
# 26 passed, 0 failed
```

Cubren: clasificación storage/network, AbortError, HTTP definitivo, max retries, errores persistentes.

### Compilación / e2e / descarga real

- `npm run build` y descarga real de modelos **requieren** Node + dependencias instaladas + navegador con WebGPU y cuota de almacenamiento suficiente.
- Este entorno sandbox no dispone de WebGPU ni de un Chrome completo para validar la descarga de los ~1,8 GB del 3B.
- Tras `npm install && npm run dev` en localhost, abrir DevTools → Console: deben aparecer mensajes `cache_diag` con fases `CACHE_ADD_FETCH`, `CACHE_PUT_OK`, etc.
- Solo declarar un modelo READY tras la verificación de generación mínima (ya existente en el worker).

## Limitaciones pendientes

1. **Validación en navegador real** obligatoria: los reintentos mitigan fallos transitorios, pero una cuota de origen agotada o un bug persistente de Chrome Cache Storage seguirán fallando de forma visible (estado ERROR, sin fingir éxito).
2. No se implementa un segundo gestor de descargas paralelo: se sigue usando el mecanismo de WebLLM (`webllm/model`, `webllm/config`, `webllm/wasm`).
3. No se borra automáticamente la caché de otros modelos.
4. Respuestas con body truncado sin Content-Length fiable no se detectan antes del put; el fallo posterior permanece visible.
