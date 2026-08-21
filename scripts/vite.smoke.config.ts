import { defineConfig } from "vite";

/**
 * Build config for the Node smoke test (dev-only).
 *   vite build --config scripts/vite.smoke.config.ts
 */
export default defineConfig({
  build: {
    outDir: "/tmp/axis-smoke-out",
    emptyOutDir: true,
    lib: {
      entry: "scripts/smoke.ts",
      formats: ["cjs"],
      fileName: () => "smoke.cjs",
    },
    target: "node22",
  },
  define: {
    "process.env": "{}",
  },
});
