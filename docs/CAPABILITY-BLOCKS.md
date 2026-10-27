# Bloqueos de capacidad (auditoría)

Estado verificado en el código de `main`. No afirma inferencia WebGPU real.

| Capacidad | Qué hay en código | Qué queda bloqueado |
|-----------|-------------------|---------------------|
| **Selección semántica de herramientas** | Protocolo JSON (`toolCalling.js`), `runToolLoop` en worker, catálogo `calculate` + `read_attached_file`, tests deterministas en `tests/toolCalling.test.js`, inyección de protocolo en personalidad | Que el **modelo** elija bien la tool en GPU real. E2E: `tests/e2e/tools-protocol.spec.js` (skip sin WebGPU/`E2E_REAL_MODEL=1`). El E2E de conversación no mide tools. |
| **Tools WebLLM nativas** | No se usan. `@mlc-ai/web-llm@0.2.79` + `response_format: json_object` + validación local | Function-calling nativo de Hermes; nuestros 4 SLM no están en la lista de tools nativas de esa versión |
| **Control de Windows** | **Ausente.** Sin Tauri/Rust/`Cargo.toml`/`src-tauri`. `server/tools.js` vacío (`enabled: false`). Puente KERNEL = chat | Repo/paquete real del conector + permisos/confirmaciones. **No** implementar shell libre ni servicio local abierto |
| **Búsqueda web** | **Ausente** en catálogo y en puente. Docs en `TOOL-EXECUTION.md` | Puente KERNEL de búsqueda bajo política local, o autorización explícita de proveedor externo (solo query mínima, nunca el hilo completo) |

## Criterio de aceptación E2E de tools (cuando haya GPU)

1. Aritmética clara → tool `calculate` o math override con resultado exacto.
2. Chat normal → `respond`, sin ejecución de tool.
3. Idealmente los cuatro `model_id` del registro KERNEL.

## Cómo ejecutar

```bash
npm test                 # unitarios + harness (sin WebGPU)
npm run test:e2e         # UI; tests @gpu omitidos en CI sin GPU
E2E_REAL_MODEL=1 npm run test:e2e   # descarga pesos; solo máquina con WebGPU
```
