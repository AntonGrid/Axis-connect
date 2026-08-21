import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Axis-connect — Plug & Play PWA.
 *
 * - `npm run dev`       — dev server at http://<LAN-IP>:5173.
 * - `HTTPS=1 npm run dev` / `npm run dev:https` — native HTTPS in Vite
 *   (basicSsl plugin, self-signed cert). For direct access from a phone over
 *   LAN-IP and prod-like tests.
 * - `npm run dev:phone` — HTTP backend + localtunnel (verified with E2E).
 * - `npm run preview:phone` — production build + localtunnel (recommended for
 *   a tunnel: ~5 files per page, no free-tier rate limit).
 *
 * ⚠️ localtunnel: the edge does NOT proxy TLS to the local backend (502), so
 * for `dev:phone`/`preview:phone` the backend stays HTTP — the edge itself
 * serves HTTPS to the phone, so there is no mixed content (Vite uses relative
 * URLs).
 *
 * Buffer polyfill for @solana/web3.js in the browser (web3.js 1.x expects a
 * global `Buffer`). The `buffer` package is wired via `import { Buffer } from
 * "buffer"` in src/polyfills.ts; here we only guard `process.env` against a
 * ReferenceError.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Native HTTPS — via the explicit HTTPS=1 flag (see the comment above).
    ...(process.env.HTTPS === "1" ? [basicSsl()] : []),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["logo.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Axis Connect",
        short_name: "Axis",
        description: "Plug & Play onboarding of Axis/ENRG energy devices",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#0b1020",
        theme_color: "#0b1020",
        lang: "en",
        categories: ["utilities", "crypto"],
        icons: [
          { src: "/icon-72.png", sizes: "72x72", type: "image/png" },
          { src: "/icon-96.png", sizes: "96x96", type: "image/png" },
          { src: "/icon-128.png", sizes: "128x128", type: "image/png" },
          { src: "/icon-144.png", sizes: "144x144", type: "image/png" },
          { src: "/icon-152.png", sizes: "152x152", type: "image/png" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-384.png", sizes: "384x384", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "/index.html",
        // RPC and device requests are NOT cached (static only).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.(devnet\.)?solana\.com.*/,
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: false, // SW only in production builds
      },
    }),
  ],
  define: {
    "process.env": "{}",
  },
  server: {
    host: true, // phone access over the LAN IP
    port: 5173,
    // localtunnel / other external tunnels send an arbitrary Host.
    // `true` (a valid value per Vite 8 types: `string[] | true`) allows any
    // Host in dev mode. Do NOT use in production.
    allowedHosts: true,
  },
  // Production preview (npm run preview:phone). Also accepts the tunnel Host.
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: "es2022",
  },
});

