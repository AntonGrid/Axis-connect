import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { getTheme } from "./lib/theme";
import { initPushNotifications } from "./lib/notifications";

// Применить сохранённую тему до первого рендера (без FOUC).
getTheme() === "light" && document.documentElement.classList.add("light");

// SW регистрирует vite-plugin-pwa (injectRegister: auto). Push-стаб.
void initPushNotifications();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
