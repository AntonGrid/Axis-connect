# Axis Connect — Plug & Play PWA

Клиентское PWA экосистемы **Axis/ENRG**: «включил устройство → отсканировал QR →
всё работает». Самостоятельный проект, не входит в модули `ENRG`.

## Возможности

- **Экран 1 — Онбординг**: автоматическое создание локального **некастодиального**
  Solana-кошелька (Ed25519 Keypair) с хранением **только** в `localStorage`
  (+ восстановление из base58-секрета). Дашборд с балансом SOL и SRC/ENRG
  (mint PDA `[b"token-mint"]`), airdrop на devnet/localnet.
- **Экран 2 — Сканирование**: камера через `html5-qrcode`; из QR извлекается
  `{ "deviceId": "...", "schema": "axis-energy-v1" }`. `deviceId` принимается в
  base58 или `0x`+hex, нормализуется в Solana PublicKey. Есть ручной ввод JSON.
- **Экран 3 — Регистрация**: on-chain флоу `register_device → claim_device →
  provision_device → activate_device` (ADR-0005). Подписи устройства получаются
  автоматически через локальный HTTP-signer прошивки (mDNS `axis-device-XXXX.local:8080`,
  модернизация Phase 3), fallback — ручной ввод подписей из Serial `SIGN`.
  Транзакции строятся вручную на `@solana/web3.js` (дискриминаторы и порядок
  аккаунтов — из IDL `enrg_mvp`, ed25519-precompile через sysvar Instructions).
- **`lib/manifestVerification.ts`**: модуль издателя манифестов
  (`register_manifest_verification`, обновлённые аккаунты Антона: `registry` PDA +
  `instructions` sysvar). ⚠️ Инструкция требует прав `oracle_authority` — это
  admin/издательский инструмент, НЕ шаг пользовательского онбординга.
- **PWA**: рукописный service worker (network-first + кэш-fallback), manifest,
  иконки.

## Запуск

```bash
npm install

# Обычный dev (localhost):
npm run dev

# Dev с HTTPS — для камеры на телефоне (getUserMedia требует secure context):
npm run dev:https
# затем откройте на телефоне https://<LAN-IP>:5173
# (сначала добавьте исключение самоподписанного сертификата)

# Проверка типов + production-сборка:
npm run build
```

## Структура

```
src/
  App.tsx                    — роутинг экранов, состояние кошелька/сети
  config.ts                  — program_id ENRG, seeds PDA, сети, константы
  types.ts                   — доменные типы (QR-пейлоад, DeviceState, шаги)
  lib/
    wallet.ts                — генерация/хранение Keypair (localStorage)
    qr.ts                    — парсинг QR + обёртка html5-qrcode
    solana.ts                — соединение, балансы, airdrop, ATA-деривация
    enrgTx.ts                — сообщения устройства, PDA, сборка/отправка тxs
    deviceSigner.ts          — клиент локального signer'а прошивки (mDNS)
    manifestVerification.ts  — модуль издателя манифестов (admin)
    borsh.ts                 — borsh-совместимые примитивы
    encoding.ts, devices.ts, pwa.ts
  components/                — Onboarding, Dashboard, Scanner, RegisterDevice, Settings
  data/enrg_mvp.json         — копия IDL из ENRG (npm run sync:idl)
public/
  manifest.webmanifest, sw.js, logo.svg, icon-*.png
```

## IDL-синхронизация

IDL контракта (`enrg_mvp`) копируется из репозитория ENRG:

```bash
npm run sync:idl   # копирует ../ENRG/target/idl/enrg_mvp.json
```

Порядок аккаунтов и дискриминаторы инструкций берутся **из IDL** — при апгрейде
контракта достаточно пересинхронизировать файл.

## Формат QR устройства

```json
{ "deviceId": "PUBLIC_KEY", "schema": "axis-energy-v1" }
```

- `deviceId` — публичный Ed25519-ключ устройства (base58 или `0x`+64 hex).
- Генератор QR — в `ENRG/firmware/esp32_proof_sender/tools/gen-device-qr.js`
  (Phase 3).

## Протокол локального signer'а (mDNS)

```
GET  http://axis-device-XXXX.local:8080/api/device/info
  → { "deviceId": "0x…", "schema": "axis-energy-v1", "firmware": "…" }
POST http://axis-device-XXXX.local:8080/api/device/sign   body: { "hex": "<message hex>" }
  → { "signature": "<0x-hex 64 bytes>" }
```

Устройство подписывает **только** domain-separated сообщения протокола
(`enrg:device:register`, `enrg:device:claim`, `enrg:device:rotate`) — произвольные
сообщения отклоняются (закрытие аудит-замечания P2 о команде `SIGN`).

⚠️ Если PWA открыт по HTTPS, браузер заблокирует прямой `http://` к устройству
(mixed content). В демо-окружении (LAN + `npm run dev`) это не мешает; для
продакшна потребуется TLS на девайсе или туннель.

## Сети

| Сеть | RPC | Airdrop |
|---|---|---|
| Devnet | `https://api.devnet.solana.com` | ✅ 1 SOL |
| Localnet | `http://127.0.0.1:8899` | ✅ 1 SOL |
| Mainnet (beta) | `https://api.mainnet-beta.solana.com` | ❌ (нужен свой SOL) |
