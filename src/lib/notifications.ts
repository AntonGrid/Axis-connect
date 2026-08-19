/**
 * Push-уведомления — подготовительный слой (для будущего релиза).
 *
 * Реальный push требует серверную часть с VAPID-ключами и подписку
 * PushManager.subscribe(userVisibleOnly, {applicationServerKey}). Здесь — стаб:
 * проверка поддержки, запрос разрешения, обработка клика по уведомлению.
 * При появлении бэкенда — заменить subscribe() на реальный VAPID-ключ.
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

/** Зарегистрировать обработчики push/клика (без реального VAPID пока нет). */
export async function initPushNotifications(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;

  // Если серверный VAPID появится — раскомментировать:
  // await reg.pushManager.subscribe({
  //   userVisibleOnly: true,
  //   applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  // });

  // Показывать локальное уведомление при клике на SW-уведомление.
  // (обработчик click живёт в service worker — см. vite-plugin-pwa injectManifest)
}

/** Конвертер VAPID base64url → Uint8Array (пригодится в будущем). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}
