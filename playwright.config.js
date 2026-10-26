import { defineConfig } from "@playwright/test";

// E2E_BASE_URL: URL de una instancia ya levantada (p. ej. http://app:8080 en docker compose).
// Si no se define, Playwright arranca el servidor sin depender del shim `npm` de Windows.
const baseURL = process.env.E2E_BASE_URL || "http://localhost:8080";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    launchOptions: {
      // WebGPU en Chromium headless: sin GPU real suele no haber adaptador (los tests lo detectan y se adaptan).
      args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--ignore-gpu-blocklist"],
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "node scripts/dev-all.mjs", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
