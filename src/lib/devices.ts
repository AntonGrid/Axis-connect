import { STORAGE_KEYS } from "../config";

/** Устройства, успешно зарегистрированные через это приложение (кэш для UI). */
export interface RegisteredDevice {
  deviceId: string; // base58
  state: string;
  addedAt: number;
}

export function listRegisteredDevices(): RegisteredDevice[] {
  const raw = localStorage.getItem(STORAGE_KEYS.registeredDevices);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RegisteredDevice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(devices: RegisteredDevice[]): RegisteredDevice[] {
  localStorage.setItem(STORAGE_KEYS.registeredDevices, JSON.stringify(devices));
  return devices;
}

export function addRegisteredDevice(
  deviceIdBase58: string,
  state = "Active",
): RegisteredDevice[] {
  const devices = listRegisteredDevices().filter((d) => d.deviceId !== deviceIdBase58);
  devices.unshift({ deviceId: deviceIdBase58, state, addedAt: Date.now() });
  return persist(devices);
}

export function removeRegisteredDevice(deviceIdBase58: string): RegisteredDevice[] {
  return persist(listRegisteredDevices().filter((d) => d.deviceId !== deviceIdBase58));
}
