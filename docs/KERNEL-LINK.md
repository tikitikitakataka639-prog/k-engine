# Vínculo K.ENGINE ↔ KERNEL

| Rol | Repo | Deploy típico |
|-----|------|----------------|
| **Motor** (este repo) | [k-engine](https://github.com/tikitikitakataka639-prog/k-engine) | `https://k-engine-git-main-tikitikitakataka639-9504.vercel.app` |
| **Interfaz** | [project-kernel-release-1-0-0](https://github.com/tikitikitakataka639-prog/project-kernel-release-1-0-0) | URL Lovable / Vercel de KERNEL |

## Dos canales

### 1. HTTP (API serverless en Vercel)

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/health` | KERNEL detecta el motor |
| GET | `/models` | Lista modelos / backends |
| POST | `/chat` | Chat si hay `KENGINE_BASE_URL` + `KENGINE_MODEL` |
| GET | `/config` | Config pública |

Cliente en KERNEL: `src/lib/kengine-api-client.ts` + `probeKEngine`.

### 2. postMessage (WebLLM en la pestaña)

KERNEL abre esta URL con `window.open`. Código en:

- Motor: `src/engine/kernelBridge.js` + `EngineProvider.jsx`
- Interfaz: `src/lib/kengine-bridge.ts`

Protocolo:

```
KERNEL → K.ENGINE  KERNEL_REQUEST { requestId, message }
K.ENGINE → KERNEL  KENGINE_BRIDGE_READY { modelReady, model }
                   KENGINE_RESPONSE { requestId, response }
                   KENGINE_ERROR { requestId, error, code }
```

Orígenes KERNEL admitidos: lista en `kernelBridge.js` (incluye release 1-0-0 y 0-6-0).
Para un dominio nuevo: añade el origin a `KERNEL_ALLOWED_ORIGINS` o abre K.ENGINE con
`?kernelOrigin=https://tu-kernel.ejemplo`.

## Cómo usarlos juntos

1. Despliega **k-engine** (ya con `/health` y `/models`).
2. En **KERNEL**, URL del motor **sin** `#lab`:
   `https://k-engine-git-main-tikitikitakataka639-9504.vercel.app`
3. **Reconectar** → probe debe decir `motor: conectado`.
4. Para chat HTTP: variables en Vercel del motor (`KENGINE_BASE_URL`, `KENGINE_MODEL`, …).
5. Para WebLLM desde KERNEL: abre el motor, INICIAR MOTOR, carga modelo READY; KERNEL usa postMessage.

## Archivos clave (este repo)

- `src/engine/kernelBridge.js` — orígenes y helpers postMessage
- `src/engine/EngineProvider.jsx` — escucha `KERNEL_REQUEST`, responde
- `api/kengine.mjs` — contrato HTTP serverless
- `vercel.json` — rewrites `/health` `/models` `/chat` → API
