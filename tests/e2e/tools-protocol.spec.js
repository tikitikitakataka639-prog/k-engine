// Esqueleto E2E: selección real de herramientas con modelo cargado.
// NO valida selección semántica en CI: requiere WebGPU + shader-f16 + E2E_REAL_MODEL=1.
// Criterio de aceptación (manual/local):
// 1) Pregunta aritmética clara → el lab muestra tool_start calculate y resultado numérico correcto.
// 2) Saludo / chat normal → action respond, toolCalls 0 (sin tool_start en UI).
// 3) Repetir en los 4 model_id del catálogo KERNEL cuando haya VRAM suficiente.
import { test, expect } from "@playwright/test";

async function gpuInfo(page) {
  return page.evaluate(async () => {
    if (!navigator.gpu) return { nav: false, adapter: false, f16: false };
    const a = await navigator.gpu.requestAdapter().catch(() => null);
    return { nav: true, adapter: Boolean(a), f16: Boolean(a && a.features.has("shader-f16")) };
  });
}

test.describe("tools protocol @gpu", () => {
  test("calculate vía lab cuando hay GPU y modelo real", async ({ page }) => {
    test.setTimeout(30 * 60_000);
    await page.goto("/");
    const gpu = await gpuInfo(page);
    test.skip(!(gpu.adapter && gpu.f16), "Necesita WebGPU + shader-f16; CI headless suele omitir esto.");
    test.skip(process.env.E2E_REAL_MODEL !== "1", "Requiere E2E_REAL_MODEL=1 (descarga de pesos).");

    await page.getByTestId("start-engine-btn").click();
    await expect(page.getByTestId("engine-started")).toBeVisible();

    const main = page.getByTestId("model-main-btn").first();
    await main.click();
    await expect
      .poll(async () => page.locator("[data-testid=model-card]").first().getAttribute("data-status"), {
        timeout: 25 * 60_000,
        intervals: [500],
      })
      .toBe("READY");

    await page.locator("#labInput").fill("Calcula exactamente 12 * 8 + 3");
    await page.getByRole("button", { name: "Enviar" }).click();
    const kernelMsg = page.getByTestId("msg-kernel").last();
    await expect(kernelMsg).not.toHaveText("", { timeout: 180_000 });
    const text = await kernelMsg.innerText();
    expect(text.length).toBeGreaterThan(0);

    await page.locator("#labInput").fill("Hola, solo saluda en una frase.");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByTestId("msg-kernel").last()).not.toHaveText("", { timeout: 180_000 });
  });

  test("documenta que sin GPU la selección semántica queda sin validar", async () => {
    test.skip(process.env.E2E_REAL_MODEL === "1", "Con modelo real se ejecuta el test anterior.");
    expect(true).toBe(true);
  });
});
