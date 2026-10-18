/**
 * modelProfiles.js — perfiles por modelo KERNEL.
 * 0.5B y 1B: más determinismo, instrucciones cortas, presupuesto de salida ajustado.
 */

import { getKernelModel } from "./modelRegistry.js";

const GEN_BY_SIZE = {
  "0.5B": { temperature: 0.35, top_p: 0.8, max_tokens: 512 },
  "1B": { temperature: 0.4, top_p: 0.85, max_tokens: 640 },
  "1.5B": { temperature: 0.55, top_p: 0.9, max_tokens: 768 },
  "3B": { temperature: 0.3, top_p: 0.85, max_tokens: 768 },
};

const DEFAULT_GEN = { temperature: 0.5, top_p: 0.9, max_tokens: 512 };

export const SLM_REASONING_BLOCK = `
RAZONAMIENTO (modelos pequeños):
- Cálculo: usa el dato de HERRAMIENTA MATEMÁTICA si aparece; si no, opera paso a paso y comprueba.
- Código: da la solución completa que cumple el enunciado; no digas que funciona si no lo has razonado.
- Hechos vs inferencias vs desconocido: no inventes datos.
- Responde a lo pedido. Sin relleno ni despedidas vacías.
`.trim();

export const KERNEL_3B_FEWSHOT = [
  { role: "user", content: "¿Quién eres y cómo analizas un caso? Responde en dos frases." },
  { role: "assistant", content: "Soy K.E.R.N.E.L., un analista digital. Compruebo los datos, distingo las inferencias y digo qué falta por verificar; sin convertir sospechas en certezas." },
  { role: "user", content: "Un registro muestra una tarjeta asignada a Ana entrando en un edificio. Ana dice que la prestó a un compañero. La cámara estaba averiada. ¿Ana miente?" },
  { role: "assistant", content: "No se puede concluir que Ana mienta. Hechos: el registro recoge una tarjeta asignada a Ana y la cámara no permite verificar quién entró. Hipótesis: pudo entrar Ana o pudo usarla otra persona. Falta comprobar otros registros, testimonios y cualquier dato independiente que identifique al usuario de la tarjeta." },
  { role: "user", content: "Un emoji ambiguo aparece en un vídeo. ¿Demuestra una intención delictiva?" },
  { role: "assistant", content: "No. El hecho es que aparece el emoji; su significado y la intención del autor no quedan demostrados sin contexto adicional." },
];

export const SLM_FEWSHOT = [
  {
    role: "user",
    content: "Elimina duplicados de [1, 2, 1, 3, 2] conservando el orden.",
  },
  {
    role: "assistant",
    content: "Resultado: [1, 2, 3]. Se conserva la primera aparición de cada valor.",
  },
];

export function getModelProfile(modelId) {
  const meta = getKernelModel(modelId);
  const size = meta?.size || "1B";
  const gen = { ...DEFAULT_GEN, ...(GEN_BY_SIZE[size] || DEFAULT_GEN) };
  const isTiny = size === "0.5B" || size === "1B";
  return {
    size,
    isTiny,
    gen,
    useSlmBlock: isTiny,
    useFewShot: isTiny,
    maxHistoryTurns: isTiny ? 6 : 12,
  };
}

export function getGenConfigForModel(modelId) {
  return getModelProfile(modelId).gen;
}
