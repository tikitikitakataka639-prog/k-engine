# Diagnóstico K.ENGINE (auditoría 2026-10-18)

## Qué funciona de verdad

| Componente | Estado |
|------------|--------|
| UI React + Model Lab | Real |
| WebLLM 0.2.79 en Worker + WebGPU | Real (solo en pestaña del usuario) |
| Cache API interceptors (add/put retries) | Real |
| modelRegistry (4 modelos) | Real |
| GET `/api/health`, `/api/models` en Vercel | Real (JSON) |
| postMessage bridge KERNEL ↔ K.ENGINE | Real (requiere pestaña abierta con modelo READY) |
| Inferencia en Vercel serverless | **Imposible** (no hay WebGPU ni worker de usuario) |

## Fallos clasificados

### 1. Rechazos injustificados (persona + pesos)
- **Causa app:** system prompts largos/confusos y few-shot de grooming en todos los turnos empujaban al 0.5B/1B a modo “seguridad”.
- **Causa modelo:** Llama/Qwen Instruct llevan alineamiento en los pesos; un prompt no lo borra del todo.
- **Mitigación aplicada:** personalidad compacta oficial; few-shot mínimo; sin rewrite de “basura corporativa”; genConfig por tamaño.

### 2. “El modelo no cambia” tras deploys
- Service worker / caché de Vite + modelo ya en RAM.
- **Acción usuario:** hard refresh + unload/reload del modelo.

### 3. Conexión KERNEL → motor local
- `/health` ≠ modelo cargado.
- Chat WebLLM **solo** si KERNEL abre `k-engine.vercel.app`, el usuario inicia motor y carga modelo READY, y postMessage usa orígenes permitidos (incluye `project-kernel-release-0-6-0.lovable.app`).
- POST `/api/chat` en Vercel **no** ejecuta WebLLM; solo openai-compatible si se configuran env vars (opcional, no es el camino local).

### 4. Descarga de modelos
- “Descargado” = shards MLC en Cache Storage del navegador (HF), no en el repo.
- Redistribución de pesos en el repo: no recomendable (licencias + tamaño).

### 5. EngineArchitecture.jsx
- Ya no importa React sin usar (corregido; no reintroducir).

## Modelos (IDs reales WebLLM)

1. `Llama-3.2-1B-Instruct-q4f16_1-MLC`
2. `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`
3. `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`
4. `Llama-3.2-3B-Instruct-q4f16_1-MLC`

## Cómo verificar inferencia local

1. Abrir https://k-engine.vercel.app
2. DevTools → Network: no debe haber POST a api.openai.com / generativos de terceros en el chat lab.
3. Tras cargar modelo: generación ocurre en el worker; GPU en `chrome://gpu` / WebGPU.
4. Offline (con modelo ya en caché): la generación puede seguir si los shards están completos.

## Variables de entorno (opcionales, sin secretos inventados)

Solo si se usa backend openai-compatible en Vercel (no es el camino WebLLM local):

- `KENGINE_BASE_URL`
- `KENGINE_MODEL`
- `KENGINE_API_KEY` (si el proveedor la exige)
- `KENGINE_AUTH_TOKEN` (proteger API)
- `KENGINE_CORS_ORIGIN`

## Limitaciones que permanecen

- Modelos ≤1B seguirán fallando en tareas complejas y a veces en refusals residuales de los pesos.
- Vercel no puede sustituir la pestaña WebLLM.
- No hay reanudación byte-range completa de shards más allá de reintentos de Cache.add.
