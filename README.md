# Axis Connect — Plug & Play PWA

The client PWA of the **Axis/ENRG** ecosystem: "plug in a device → scan the QR →
everything works". A standalone project, not part of the `ENRG` modules.

## Features

- **Screen 1 — Onboarding**: a non-custodial Solana wallet (Ed25519 Keypair,
  stored **only** in `localStorage`), the tagline "Connect your device in
  10 seconds…", create/import/backup.
- **Screen 2 — Energy dashboard** (the main metric is ENERGY, not crypto):
  a "Energy produced" (kWh) hero with a growth animation + "SRC earned";
  current power with a pulse + a 24h chart (Recharts); SOL is hidden and only
  visible when gas is low; devices — interactive cards with a today-production
  progress bar (online/offline via mDNS); SRC is shown as "accumulated energy"
  (≈ kWh) with a "dripping tokens" animation; accrual history with
  human-friendly labels ("+5.2 SRC for 2.3 kWh") without hashes.
- **Screen 3 — Scanning**: an alignment frame, a green highlight on success, a
  "Device: ESP32-XXXX" preview + a "Connect" button; manual entry.
- **Device screen**: public key, current power, total/this-month energy,
  ≈ SRC accrued, on-chain status (EnergyProducer PDA), disconnect with
  confirmation.
- **Settings**: copy address, export private key (with a warning), network
  (Devnet/Mainnet/Local), **theme toggle** (dark/light), delete wallet.
- **Registration**: on-chain `register_device → claim → provision → activate`
  (ADR-0005); signatures via the firmware local HTTP-signer (mDNS) or the
  manual mode (Serial `SIGN`). `register_manifest_verification` — an admin
  module.
- **ENRG integration**: `getEnergyProducer` (full borsh parser),
  `claim_rewards` (staking), the `enrg_mvp` IDL is synced (`npm run sync:idl`).
- **PWA**: `vite-plugin-pwa` (icons 72–512 + maskable, workbox offline cache,
  auto SW registration), a push-notifications stub.

## Tests

- **Vitest (unit/component)** — 50 tests: wallet, qr, borsh, encoding,
  energyHistory, solana.formatAtomic, enrgTx (serialization verified against
  Anchor **byte-for-byte** from the IDL), parseEnergyProducer, plus Onboarding,
  Dashboard, Scanner, Settings.
- **Playwright E2E** — "Create wallet → Scan QR → Register device" (the devnet
  RPC is mocked via route interception, deterministic).
- `npm run smoke` — reference verification of transactions vs @coral-xyz/anchor.

> Test hacks: `src/test/setup.ts` restores Node `Uint8Array`/`Buffer` (jsdom
> replaces them with another realm — that breaks web3.js) and replaces
> `PublicKey.findProgramAddress*` with a replica of the algorithm that uses the
> native @noble/curves curve check (under the vitest transform `isOnCurve`
> stops validating).


## Running

```bash
npm install

# Regular dev (localhost):
npm run dev

# Native HTTPS in dev (for direct access from a phone over LAN-IP:
# https://<LAN-IP>:5173, accept the self-signed cert first):
npm run dev:https

# Type-check + production build:
npm run build

# Tests:
npm test          # Vitest: unit + components (50 tests)
npm run test:e2e  # Playwright: "Wallet → QR → Registration" (RPC mocked)
npm run smoke     # transaction serialization vs Anchor (byte-for-byte)
```

### Testing from a phone / laptop via a tunnel

> ⚠️ **Always use `npm run dev:phone`** (production build + preview):
> localtunnel (free tier) rate-limits parallel requests (429/502).
> Vite **dev** serves every module as a separate request (`/src/*`,
> `/node_modules/.vite/deps/*`) — the browser hits 502 on modules and the
> manifest. A production build is ~6 files per page, so the limit does not
> trigger.

```bash
# ✅ RECOMMENDED (one command, always works):
npm run dev:phone
# → build (~5s), then: vite preview on :4173 + localtunnel
# → in the log: "your url is: https://<subdomain>.loca.lt" — open it on the phone
```

Other options (for a LAN / special cases):

```bash
# Hot dev + localtunnel: DO NOT use through a free tunnel
# (hundreds of module requests → 502/429); only suitable for a LAN-IP:
npm run dev:phone:hot

# Dev server + cloudflared (HTTP/2; in some WSL/networks UDP/QUIC is cut):
npm run dev:phone:cf
```

Ports: `server` → `:5173` (dev, HMR), `preview` → `:4173` (prod preview).
Both accept an arbitrary tunnel `Host` (`allowedHosts: true`, dev/preview only).


## Structure

```
src/
  App.tsx                    — screen routing, wallet/network state
  config.ts                  — ENRG program_id, PDA seeds, networks, constants
  types.ts                   — domain types (QR payload, DeviceState, steps)
  lib/
    wallet.ts                — Keypair generation/storage (localStorage)
    qr.ts                    — QR parsing + html5-qrcode wrapper
    solana.ts                — connection, balances, airdrop, ATA derivation
    enrgTx.ts                — device messages, PDAs, tx building/sending
    deviceSigner.ts          — client of the firmware local signer (mDNS)
    manifestVerification.ts  — manifest publisher module (admin)
    borsh.ts                 — borsh-compatible primitives
    encoding.ts, devices.ts, pwa.ts
  components/                — Onboarding, Dashboard, Scanner, RegisterDevice, Settings
  data/enrg_mvp.json         — copy of the IDL from ENRG (npm run sync:idl)
public/
  manifest.webmanifest, sw.js, logo.svg, icon-*.png
```

## IDL sync

The contract IDL (`enrg_mvp`) is copied from the ENRG repository:

```bash
npm run sync:idl   # copies ../ENRG/target/idl/enrg_mvp.json
```

Account order and instruction discriminators are taken **from the IDL** — after
a contract upgrade it is enough to re-sync the file.

## Device QR format

```json
{ "deviceId": "PUBLIC_KEY", "schema": "axis-energy-v1" }
```

- `deviceId` — the device's public Ed25519 key (base58 or `0x`+64 hex).
- The QR generator is in `ENRG/firmware/esp32_proof_sender/tools/gen-device-qr.js`
  (Phase 3).

## Local signer protocol (mDNS)

```
GET  http://axis-device-XXXX.local:8080/api/device/info
  → { "deviceId": "0x…", "schema": "axis-energy-v1", "firmware": "…" }
POST http://axis-device-XXXX.local:8080/api/device/sign   body: { "hex": "<message hex>" }
  → { "signature": "<0x-hex 64 bytes>" }
```

The device signs **only** domain-separated protocol messages
(`enrg:device:register`, `enrg:device:claim`, `enrg:device:rotate`) — arbitrary
messages are rejected (closes the audit P2 note about the `SIGN` command).

⚠️ If the PWA is served over HTTPS, the browser blocks a direct `http://` call
to the device (mixed content). In a demo environment (LAN + `npm run dev`) this
does not matter; production needs TLS on the device or a tunnel.

## Networks

| Network | RPC | Airdrop |
|---|---|---|
| Devnet | `https://api.devnet.solana.com` | ✅ 1 SOL |
| Localnet | `http://127.0.0.1:8899` | ✅ 1 SOL |
| Mainnet (beta) | `https://api.mainnet-beta.solana.com` | ❌ (bring your own SOL) |
