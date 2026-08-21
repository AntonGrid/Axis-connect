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
    // web3.js (CJS) ↔ @noble/curves (ESM): under the vitest transform
    // PublicKey.findProgramAddressSync breaks ("Unable to find a viable
    // program address nonce"). Fix: load @noble/curves natively in Node
    // (as in plain node — it works).
    server: {
      deps: {
        external: ["@noble/curves", "@noble/hashes"],
      },
    },
  },
});
