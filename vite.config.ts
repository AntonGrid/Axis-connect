import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Axis-connect — Plug & Play PWA.
 *
 * - `npm run dev`       — dev-сервер на http://<LAN-IP>:5173.
 * - `HTTPS=1 npm run dev` / `npm run dev:https` — нативный HTTPS в Vite
 *   (плагин basicSsl, самоподписанный сертификат). Для прямого доступа
 *   с телефона по LAN-IP и prod-подобных тестов.
 * - `npm run dev:phone` — HTTP-бэкенд + localtunnel (проверено E2E).
 * - `npm run preview:phone` — production-сборка + localtunnel (рекомендуется
 *   для туннеля: ~5 файлов на страницу, без рейт-лимита free-тира).
 *
 * ⚠️ localtunnel: edge НЕ проксирует TLS к локальному бэкенду (502), поэтому
 * для `dev:phone`/`preview:phone` бэкенд остаётся HTTP — edge сам отдаёт
 * телефону HTTPS, mixed content нет (Vite использует относительные URL).
 *
 * Buffer-полифилл для @solana/web3.js в браузере (web3.js 1.x ожидает глобальный
 * `Buffer`). Пакет `buffer` подключается через `import { Buffer } from "buffer"`
 * в src/polyfills.ts; здесь лишь страхуем `process.env` от ReferenceError.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Нативный HTTPS — по явному флагу HTTPS=1 (см. комментарий выше).
    ...(process.env.HTTPS === "1" ? [basicSsl()] : []),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["logo.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Axis Connect",
        short_name: "Axis",
        description: "Plug & Play онбординг энерго-устройств экосистемы Axis/ENRG",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#0b1020",
        theme_color: "#0b1020",
        lang: "ru",
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
        // RPC и запросы к устройству НЕ кэшируем (только статика).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.(devnet\.)?solana\.com.*/,
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: false, // SW только в production-сборке
      },
    }),
  ],
  define: {
    "process.env": "{}",
  },
  server: {
    host: true, // доступ с телефона по LAN IP
    port: 5173,
    // localtunnel / другие внешние туннели присылают произвольный Host.
    // `true` (валидное значение по типам Vite 8: `string[] | true`) разрешает
    // любой Host в dev-режиме. НЕ использовать в production.
    allowedHosts: true,
  },
  // Production-превью (npm run preview:phone). Тоже принимает Host туннеля.
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: "es2022",
  },
});

