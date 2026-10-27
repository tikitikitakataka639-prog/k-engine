# Ejecución local de herramientas

Consulta el [estado de bloqueos de capacidades](./CAPABILITY-BLOCKS.md).

## Estado comprobado

La inferencia sigue en el navegador con WebLLM. La versión fijada, `@mlc-ai/web-llm@0.2.79`, declara compatibilidad nativa con `tools` solo para sus modelos Hermes 8B; ninguno de los cuatro modelos configurados en K.ENGINE está en esa lista. Por eso, K.ENGINE no envía `tools` nativas a WebLLM. Usa una decisión JSON en modo `json_object`, valida el objeto y los argumentos contra un catálogo local estricto y solo entonces ejecuta una herramienta.

El ciclo limita las llamadas por turno, detiene llamadas repetidas, recibe cancelación y devuelve resultados tipados al modelo en un mensaje etiquetado, sin fingir llamadas nativas que los modelos no soportan. Las respuestas y los fallos de herramientas se muestran en el laboratorio. Un JSON no válido o una herramienta desconocida termina con un error; no se interpreta texto ordinario como una acción.

## Herramientas que sí están disponibles

| Herramienta | Permiso | Confirmación | Límite |
|---|---|---|---|
| `calculate` | Local | No | Aritmética restringida; no evalúa código libre |
| `read_attached_file` | Archivo elegido explícitamente en el chat | La selección del archivo es el consentimiento | TXT, MD, CSV, JSON o LOG; 64 KiB y 6000 caracteres como máximo |

El texto del archivo se lee en el navegador, se entrega al modelo local solo si este solicita la herramienta y no se guarda en el historial. El nombre del archivo no se interpreta como una ruta.

## Capacidades no disponibles

- **Búsqueda web:** el usuario autorizó usarla solo si KERNEL ofrece una herramienta mediante el puente; el contrato accesible de KERNEL solo contiene solicitudes/respuestas de chat y no ofrece búsqueda. No se envía una consulta a un proveedor externo.
- **Windows:** no se encontró el proyecto Tauri/Rust ni un conector instalado en los repositorios accesibles. El repositorio público `K.engine-kernel-motor` es una aplicación web y no contiene `Cargo.toml`, `src-tauri` ni comandos Tauri. No se anuncian ni se simulan herramientas de Windows.
- **MCP:** no se añade. Sin un host de herramientas Tauri disponible, el protocolo local estricto es suficiente para las dos herramientas del navegador; cuando exista el conector, MCP podrá adaptarse a la misma interfaz y reutilizar sus validaciones.

Por tanto, esta implementación no habilita todavía operaciones de Windows y no satisface el criterio de ejecución autorizada en el equipo. Para completarlo hace falta incorporar o registrar el repositorio/paquete real del conector, inspeccionar sus comandos y permisos, y añadir su transporte probado. No se debe sustituir esa dependencia por `localhost` abierto o shell libre.

## Uso y comprobaciones

1. Instala dependencias con `npm install` y arranca `npm run dev`.
2. Inicia el motor y carga uno de los cuatro modelos existentes.
3. Para analizar un archivo, usa el botón de adjunto y elige un archivo de texto compatible; formula la petición. La herramienta solo estará en el catálogo para ese mensaje.
4. El laboratorio muestra la llamada y su resultado. La búsqueda y Windows no aparecerán como herramientas disponibles.

`npm test` comprueba el protocolo y el ciclo con ejecutores deterministas; eso no demuestra que los modelos elijan herramientas. Playwright incluye una prueba real por cada modelo KERNEL: comprueba que una petición aritmética en lenguaje natural ejecuta `calculate`, devuelve el resultado exacto y que una pregunta normal no llama herramientas. Por defecto quedan omitidas. En PowerShell, habilita explícitamente la descarga y ejecuta cada modelo por separado:

```powershell
$env:E2E_REAL_MODEL = "1"
$env:E2E_TOOL_MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
npm run test:e2e -- --grep "tools reales"
```

Repite cambiando `E2E_TOOL_MODEL` por cada ID de `src/engine/modelRegistry.js`. Requiere WebGPU con `shader-f16`; la prueba también se omite si el modelo no cabe según la compatibilidad detectada. El resultado solo cuenta como validación semántica para el modelo y equipo que hayan completado la prueba: registra el modelo, navegador/GPU, llamada visible `calculate`, resultado `49997` y ausencia de actividad de herramientas en la pregunta normal.

Durante el ciclo estructurado, K.ENGINE retiene el JSON de decisión y muestra el texto final al completarse. Las métricas cuentan los tokens reportados por WebLLM para las decisiones JSON, suman el tiempo de inferencia de cada paso y excluyen el tiempo de ejecución de herramientas; el primer token medido pertenece al primer JSON del modelo, no al primer carácter visible de la respuesta final.
