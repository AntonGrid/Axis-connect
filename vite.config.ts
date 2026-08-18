import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

/**
 * Axis-connect — Plug & Play PWA.
 *
 * - `npm run dev`        — dev-сервер на http://<LAN-IP>:5173 (обычный режим).
 * - `npm run dev:https`  — то же + самоподписанный TLS (basic-ssl). Нужен,
 *   когда приложение открывается с телефона и камера (getUserMedia) обязана
 *   работать в secure context: браузеры блокируют камеру на plain-http кроме
 *   localhost.
 *
 * Buffer-полифилл для @solana/web3.js в браузере (web3.js 1.x ожидает глобальный
 * `Buffer`). Сам пакет `buffer` подключается через `import { Buffer } from "buffer"`
 * в src/polyfills.ts; здесь лишь страхуем `process.env` от ReferenceError.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Включаем TLS только по явному флагу, чтобы не мешать обычной разработке.
    ...(process.env.HTTPS === "1" ? [basicSsl()] : []),
  ],
  define: {
    "process.env": "{}",
  },
  server: {
    host: true, // доступ с телефона по LAN IP
    port: 5173,
    // localtunnel / другие внешние туннели присылают произвольный Host
    // (например, <subdomain>.loca.lt). Без этого Vite блокирует запросы:
    //   "Blocked request. This host is not allowed."
    // `true` (валидное значение по типам Vite 8: `string[] | true`) разрешает
    // любой Host в dev-режиме. НЕ использовать в production (vite preview).
    allowedHosts: true,
  },
  build: {
    target: "es2022",
  },
});
