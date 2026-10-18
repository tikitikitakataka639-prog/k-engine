# Mejoras SLM (Qwen2.5 0.5B y Llama 3.2 1B) — K.ENGINE 1.5.0

## Qué se cambió

| Archivo | Cambio |
|---------|--------|
| `src/engine/mathTools.js` | Cálculo determinista (aritmética, %, horarios) |
| `src/engine/modelProfiles.js` | Perfiles por tamaño (temp/top_p/max_tokens) |
| `src/engine/outputGuard.js` | Anti-bucles y anti-plantillas corporativas |
| `src/engine/personalityInjector.js` | Orquesta math + SLM block + few-shot |
| `src/engine/personality.small.js` | Prompt compacto orientado a utilidad |
| `src/engine/genConfig.js` | Delega en modelProfiles |
| `src/engine/EngineProvider.jsx` | Pasa resumen math al post-proceso |
| `tests/mathTools.test.js` | Pruebas deterministas |
| `tests/slm-eval.harness.js` | Batería offline + casos para WebGPU |

## Perfiles de generación

| Modelo | temperature | top_p | max_tokens |
|--------|-------------|-------|------------|
| 0.5B | 0.35 | 0.80 | 512 |
| 1B | 0.40 | 0.85 | 640 |
| 1.5B | 0.55 | 0.90 | 768 |
| 3B | 0.60 | 0.90 | 896 |

## Math tool

Se activa solo si el mensaje del usuario coincide con patrones seguros.
No ejecuta código del modelo. Resultado inyectado en el system como
`HERRAMIENTA MATEMÁTICA` para que el SLM lo explique.

Caso de referencia: tareas 20+35+15 min desde 16:10 → **17:20**.

## Limitación

Este entorno no tiene WebGPU: las pruebas offline validan herramientas y
perfiles. La comparación 0.5B/1B vs 1.5B en el navegador usa los mismos casos
de `slm-eval.harness.js` (MATH/CODE/COMM/INSTR/ANALYZE).

No se afirma que las capacidades intrínsecas del 0.5B igualen al 1.5B.
