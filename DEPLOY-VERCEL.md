# Despliegue Vercel + KERNEL

## Qué hay en este deploy

| Ruta | Comportamiento |
|------|----------------|
| `/` (UI) | SPA Vite: WebLLM/WebGPU en el **navegador** |
| `GET /health` | API serverless → `{"status":"ok","engine":"K.ENGINE",...}` |
| `GET /models` | Lista modelos + estado backends |
| `POST /chat` | Solo si configuras **openai-compatible** (env) |
| `/bridge/*` | **No** disponible en serverless (hace falta `server.js` persistente) |

## Por qué KERNEL decía «sin mecanismo compatible»

La UI era pública, pero `/health` y `/models` devolvían `index.html` (rewrite SPA).
KERNEL no veía API. Eso queda corregido con `api/*` + rewrites en `vercel.json`.

## Variables de entorno (Vercel → Settings → Environment Variables)

Opcionales; **no** las pongas en el frontend:

| Variable | Uso |
|----------|-----|
| `KENGINE_BASE_URL` | p.ej. `https://api.openai.com/v1` u Ollama remoto |
| `KENGINE_API_KEY` | Clave del proveedor |
| `KENGINE_MODEL` | id del modelo |
| `KENGINE_AUTH_TOKEN` | Si se define, KERNEL debe enviar `Authorization: Bearer …` |
| `KENGINE_CORS_ORIGIN` | Orígenes KERNEL (o `*` en pruebas) |
| `KENGINE_BACKEND` | `auto` \| `openai-compatible` \| `webllm` |

Sin `BASE_URL`+`MODEL`, `/chat` responde 503 con mensaje claro; `/health` y `/models` siguen OK para que KERNEL detecte el motor.

## WebLLM «de verdad» con KERNEL

El modelo local solo corre en una **pestaña**. El bridge SSE de `server.js` no cabe bien en Vercel serverless.

Opciones:
1. **openai-compatible** en Vercel (env vars) → KERNEL usa `/chat`.
2. Host Node con `npm start` (Railway/Render/VPS) → bridge + pestaña K.ENGINE abierta.
3. Uso solo en navegador (sin KERNEL remoto) en la URL de Vercel.

## Comprobar tras el deploy

```bash
curl -s https://TU-DOMINIO.vercel.app/health
curl -s https://TU-DOMINIO.vercel.app/models
```

Debes ver JSON con `"engine":"K.ENGINE"`, no HTML.
