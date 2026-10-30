# K.ENGINE — estado de uso

- **Listo:** motor local WebLLM/WebGPU, lab aislado, bridge `postMessage`, métricas de generación y guardas de fidelidad al finalizar la respuesta.
- **Modelos:** Llama 3.2 1B, Llama 3.2 3B, Qwen 2.5 0.5B y Qwen 2.5 1.5B (`q4f16_1`).
- **Conectar KERNEL:** configura `https://k-engine.vercel.app/` como motor en `https://project-kernel-release-1-0-0.lovable.app`.
- KERNEL debe abrir K.ENGINE como popup con `window.open`. En K.ENGINE pega `https://project-kernel-release-1-0-0.lovable.app` en **INTRODUCIR URL DE K.E.R.N.E.L** y pulsa **GUARDAR**.
- Inicia el motor y carga un modelo hasta **READY** antes de enviar mensajes desde KERNEL. El bridge valida origen HTTPS exacto y el `window.opener`.
- El protocolo intercambia `KERNEL_REQUEST`, `KENGINE_BRIDGE_READY`, `KENGINE_RESPONSE` y `KENGINE_ERROR`; los pasos y errores están en [KERNEL-LINK.md](./KERNEL-LINK.md).
- **Fidelidad:** la sustitución por borrador mínimo ocurre al finalizar el stream; el modelo todavía puede mostrar afirmaciones inventadas durante el streaming.
- Todo borrador de denuncia requiere revisión humana antes de utilizarlo; no constituye una denuncia verificada ni una conclusión legal.
- **Limitaciones:** no se implementan Windows, shell, búsqueda web ni proveedores remotos de chat. Métricas que WebLLM no informe aparecen como `N/A`.
- El modelo 3B puede no cargar si la GPU no tiene memoria suficiente; WebGPU no expone una medida fiable de VRAM disponible.
- `npm test` comprueba protocolos y guardas de forma determinista. No equivale a una prueba de inferencia real con WebGPU/modelos descargados; esa comprobación debe hacerse en un navegador compatible.

**Criterio de completo usable:** cuatro modelos locales disponibles, métricas declaradas sin inventar datos, bridge documentado y borradores fieles al terminar la generación, con revisión humana.
