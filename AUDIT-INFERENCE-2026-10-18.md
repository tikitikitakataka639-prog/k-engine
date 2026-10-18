# Auditoría de fiabilidad de inferencia — 18/10/2026

## Alcance y límites

Auditoría estática del árbol público de `tikitikitakataka639-prog/k-engine`, rama `main`, commit de referencia `38189082a23a1b3ff2e411e98e3eb8434e408acb`. No se ha ejecutado un navegador con WebGPU desde esta auditoría; por tanto, no se afirma que se hayan reproducido descargas, cargas GPU o generaciones reales. Los errores de Cache API deben volver a probarse en un navegador real y con los diagnósticos de la UI.

## Hallazgos demostrables en el código

1. **Parámetros de generación descartados.** `src/engine/EngineProvider.jsx` obtiene `temperature` y `top_p` de `injectPersonality()` y los entrega a `modelManager.generate()`; `src/engine/modelManager.js` reenvía el trabajo al worker. Sin embargo, `src/webllm/kengine-worker.js` fija `temperature: 0.7` y no envía `top_p`. Por tanto, los perfiles definidos en `src/engine/genConfig.js` no se aplican íntegramente al generar.
2. **El filtro de respuestas puede sustituir contenido por una frase genérica.** `src/engine/personalityInjector.js` reemplaza respuestas que coinciden con una expresión de rechazo por textos prefabricados, y en el laboratorio `EngineProvider.jsx` llama a `finalizeAssistantText()` sin pasar el mensaje del usuario. El filtro no reintenta la inferencia ni conoce con fiabilidad la intención; puede ocultar el resultado real y producir respuestas inútiles.
3. **El parámetro few-shot no tiene efecto.** `injectPersonality()` acepta `includeFewShot`, pero no lo utiliza. En `api/kengine.mjs` se activa y se comenta que se aplica few-shot, pero el código no lo añade.
4. **El catálogo no contiene los pesos.** `modelRegistry.js` define las fichas; los pesos se descargan mediante WebLLM y se guardan en la caché del navegador. Las banderas `corporateLimits: false` y `kernelPersonality: true` son metadatos y no modifican los pesos ni las políticas internas aprendidas por el modelo.
5. **Contexto local limitado por configuración.** Las cuatro fichas declaran `contextWindow: 4096` y usan el prompt compacto. `chatContext.js` estima tokens por caracteres, recorta el prompt/historial y no usa el tokenizador real del modelo. Esta aproximación puede truncar instrucciones o conversaciones.
6. **Separación de API y navegador.** `api/kengine.mjs` documenta que Vercel serverless no mantiene el puente SSE hacia una pestaña WebLLM; allí los cuatro modelos figuran como `no_browser_connected`. La inferencia WebLLM real se ejecuta en la UI/worker del navegador. No debe confundirse un endpoint HTTP activo con un modelo local cargado.
7. **Caché/descargas.** El worker ya incorpora instrumentación y reintentos para `Cache.add()`/`Cache.put()`, diagnóstico de almacenamiento y sondeo de recursos. El código no demuestra que esos reintentos resuelvan errores del navegador, cuota, red, shards o incompatibilidad. Hace falta probar cada modelo desde un navegador compatible y guardar el resultado del diagnóstico.

## Estado de las comprobaciones

- **Verificado por inspección de código:** parámetros de generación ignorados parcialmente; filtro postgeneración que reemplaza respuestas; `includeFewShot` sin implementación; pesos fuera del repositorio; diferencia entre API serverless y WebLLM local.
- **Pendiente de ejecución real:** descarga y carga de cada uno de los cuatro modelos; respuesta a una batería fija de prompts españoles; compatibilidad WebGPU/`shader-f16`; errores actuales de Cache API, red, almacenamiento y workers; prueba de integración real desde KERNEL.
- **No se ha vuelto a diagnosticar** el antiguo error `React is not defined`; no se modifica `EngineArchitecture.jsx`.

## Criterio de corrección

Corregir primero los defectos deterministas de la tubería de inferencia, evitar reemplazar silenciosamente respuestas del modelo por mensajes genéricos y mantener el modelo local, el catálogo y el puente existentes. No afirmar que se han eliminado las limitaciones inherentes a los pesos ni que los cuatro modelos funcionan hasta completar pruebas reales.
