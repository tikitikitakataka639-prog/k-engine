# Despliegue en Vercel (K.ENGINE)

## Qué se despliega

- **UI React + Vite** (`dist/`)
- Inferencia **100 % en el navegador** (WebLLM + WebGPU)
- **No** se ejecuta `server.js` en Vercel (la API HTTP es opcional y local/otro host)

## Por qué no hay COEP / COOP estrictos

`Cross-Origin-Embedder-Policy: require-corp` rompe la descarga de pesos desde Hugging Face
(muchas respuestas no envían `Cross-Origin-Resource-Policy`). Por eso **no** se activa
aislamiento cross-origin en `vercel.json`: la descarga de modelos y la Cache API de WebLLM
fluyen sin bloqueos artificiales.

El Service Worker (`public/sw.js`) **solo** cachea el app shell del mismo origen y **nunca**
intercepta Hugging Face / GitHub / la API.

## Pasos en Vercel

1. Importar el repo `k-engine` desde GitHub.
2. Framework: **Vite** (o dejar que lea `vercel.json`).
3. Build: `npm run build` · Output: `dist` · Node.js: **20.x**.
4. Deploy.

URL resultante: `https://….vercel.app` (HTTPS → WebGPU OK).

## Uso en producción

1. Chrome o Edge reciente.
2. **INICIAR MOTOR** → comprobar WebGPU.
3. Descargar un modelo del catálogo (primera vez: red a Hugging Face).
4. Chat en Model Lab.

Si un modelo falla al descargar: usa el panel **DIAGNOSTICAR RECURSOS** y, si hace falta,
**FORMATEAR MODELO** en la tarjeta (borra solo ese modelo en Cache API, no toda la app).

## API opcional

Para `/health`, `/chat`, bridge con KERNEL, ejecuta `server.js` en otro host o en local
(`npm run dev` / `npm start` tras `npm run build`).
