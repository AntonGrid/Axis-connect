/**
 * Полифиллы для @solana/web3.js в браузере.
 *
 * web3.js 1.x написан под Node: ожидает глобальный `Buffer`, иногда ссылается
 * на `global`/`process`. Подключаем пакет `buffer` (уже в dependencies) и
 * подставляем минимальные глобальные заглушки.
 */
import { Buffer } from "buffer";

const g = globalThis as unknown as Record<string, unknown>;

if (!g.Buffer) g.Buffer = Buffer;
if (!g.global) g.global = globalThis;
if (!g.process) g.process = { env: {} };
