/**
 * Polyfills for @solana/web3.js in the browser.
 *
 * web3.js 1.x is written for Node: it expects a global `Buffer` and sometimes
 * references `global`/`process`. We wire up the `buffer` package (already in
 * dependencies) and install minimal global shims.
 */
import { Buffer } from "buffer";

const g = globalThis as unknown as Record<string, unknown>;

if (!g.Buffer) g.Buffer = Buffer;
if (!g.global) g.global = globalThis;
if (!g.process) g.process = { env: {} };
