import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { getTheme } from "./lib/theme";
import { initPushNotifications } from "./lib/notifications";

// Apply the saved theme before the first render (no FOUC).
getTheme() === "light" && document.documentElement.classList.add("light");

// SW is registered by vite-plugin-pwa (injectRegister: auto). Push stub.
void initPushNotifications();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
