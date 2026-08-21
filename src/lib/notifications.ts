/**
 * Push notifications — a preparatory layer (for a future release).
 *
 * Real push requires a server side with VAPID keys and a subscription via
 * PushManager.subscribe(userVisibleOnly, {applicationServerKey}). Here — a
 * stub: support check, permission request, notification-click handling.
 * Once a backend exists — replace subscribe() with a real VAPID key.
 */

export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  return Notification.requestPermission();
}

/** Register push/click handlers (no real VAPID yet). */
export async function initPushNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;

  // If a server VAPID appears — uncomment:
  // await reg.pushManager.subscribe({
  //   userVisibleOnly: true,
  //   applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  // });

  // Show a local notification when clicking an SW notification.
  // (the click handler lives in the service worker — see vite-plugin-pwa injectManifest)
}

/** VAPID base64url → Uint8Array converter (useful in the future). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}
