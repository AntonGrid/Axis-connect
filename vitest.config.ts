import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // web3.js (CJS) ↔ @noble/curves (ESM): в трансформе vitest ломается
    // PublicKey.findProgramAddressSync ("Unable to find a viable program address nonce").
    // Решение: @noble/curves загружается нативно Node (как в plain node — работает).
    server: {
      deps: {
        external: ["@noble/curves", "@noble/hashes"],
      },
    },
  },
});
