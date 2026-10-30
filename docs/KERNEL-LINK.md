# Vínculo K.ENGINE ↔ KERNEL

## Conexión WebLLM mediante popup

1. En KERNEL (`https://project-kernel-release-1-0-0.lovable.app`), configura como motor la URL `https://k-engine.vercel.app/`.
2. KERNEL debe abrir esa URL con `window.open`; el puente WebLLM requiere que la ventana del motor tenga a KERNEL como `window.opener`. No uses `noopener` para esta ventana. Permite los popups para el sitio si el navegador los bloquea.
3. En K.ENGINE, en **INTRODUCIR URL DE K.E.R.N.E.L**, pega `https://project-kernel-release-1-0-0.lovable.app` y pulsa **GUARDAR**. Esta URL identifica el origen de KERNEL; no pegues aquí la URL de K.ENGINE.
4. En la pestaña del motor, pulsa **INICIAR MOTOR** y carga uno de los modelos hasta que indique **READY**. Después, KERNEL puede enviar solicitudes por el popup.

El origen Lovable oficial está admitido explícitamente en `KERNEL_ALLOWED_ORIGINS`; el bridge solo acepta orígenes HTTPS exactos. El popup también comprueba `event.source === window.opener`.

Mensajes del protocolo:

```text
KERNEL → K.ENGINE  { type: "KERNEL_REQUEST", requestId, message }
K.ENGINE → KERNEL  { type: "KENGINE_BRIDGE_READY", modelReady, model }
K.ENGINE → KERNEL  { type: "KENGINE_RESPONSE", requestId, response }
K.ENGINE → KERNEL  { type: "KENGINE_ERROR", requestId, error, code }
```

`message` debe contener texto no vacío y no superar 8000 caracteres. `requestId` correlaciona la petición y respuesta. `KENGINE_BRIDGE_READY` informa si hay un modelo listo, pero KERNEL debe esperar a `modelReady: true` antes de enviar chat. Errores habituales: `origin` no admitido (no llega respuesta), `model_not_ready`, `busy`, `generation_not_started` y `cancelled`.

La API HTTP de `/health`, `/models` y `/chat` es un canal distinto; el chat HTTP requiere configuración de backend y no equivale al bridge local WebLLM.

| Rol | Repo | Deploy típico |
|-----|------|----------------|
| **Motor** (este repo) | [k-engine](https://github.com/tikitikitakataka639-prog/k-engine) | `https://k-engine.vercel.app` |
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

1. Configura la URL `https://k-engine.vercel.app/` como motor en **KERNEL**.
2. **Reconectar** → el probe HTTP debe decir `motor: conectado`.
3. Para chat HTTP: configura en Vercel del motor `KENGINE_BASE_URL`, `KENGINE_MODEL` y las credenciales aplicables.
4. Para WebLLM local: sigue los pasos de **Conexión WebLLM mediante popup**; KERNEL usa postMessage y la inferencia permanece en el navegador.

## Archivos clave (este repo)

- `src/engine/kernelBridge.js` — orígenes y helpers postMessage
- `src/engine/EngineProvider.jsx` — escucha `KERNEL_REQUEST`, responde
- `api/kengine.mjs` — contrato HTTP serverless
- `vercel.json` — rewrites `/health` `/models` `/chat` → API
