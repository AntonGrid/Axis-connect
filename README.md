# Axis Connect — Plug & Play PWA

Клиентское PWA экосистемы **Axis/ENRG**: «включил устройство → отсканировал QR →
всё работает». Самостоятельный проект, не входит в модули `ENRG`.

## Возможности

- **Экран 1 — Онбординг**: некастодиальный Solana-кошелёк (Ed25519 Keypair,
  хранение **только** в `localStorage`), теглайн «Подключите устройство за
  10 секунд…», создание/импорт/бэкап.
- **Экран 2 — Энергетический дашборд** (главная метрика — ЭНЕРГИЯ, не крипто):
  hero «Выработано энергии» (кВт·ч) с анимацией роста + «начислено SRC»;
  текущая мощность с пульсацией + график 24ч (Recharts); SOL скрыт и виден
  только при нехватке газа; устройства — интерактивные карточки с прогресс-баром
  выработки за сегодня (онлайн/оффлайн по mDNS); SRC отображается как
  «накопленная энергия» (≈ кВт·ч) с анимацией «капающих» токенов; история
  начислений человеческими метками («+5.2 SRC за 2.3 кВт·ч») без хешей.
- **Экран 3 — Сканирование**: рамка для наведения, зелёная подсветка при
  успехе, превью «Устройство: ESP32-XXXX» + кнопка «Подключить»; ручной ввод.
- **Экран устройства**: публичный ключ, текущая мощность, всего/за месяц
  энергии, ≈ начислено SRC, on-chain статус (EnergyProducer PDA), отключение
  с подтверждением.
- **Настройки**: копирование адреса, экспорт приватного ключа (с
  предупреждением), сеть (Devnet/Mainnet/Local), **переключатель темы**
  (тёмная/светлая), удаление кошелька.
- **Регистрация**: on-chain `register_device → claim → provision → activate`
  (ADR-0005); подписи через локальный HTTP-signer прошивки (mDNS) или ручной
  режим (Serial `SIGN`). `register_manifest_verification` — admin-модуль.
- **ENRG-интеграция**: `getEnergyProducer` (полный borsh-парсер),
  `claim_rewards` (staking), IDL `enrg_mvp` синхронизируется (`npm run sync:idl`).
- **PWA**: `vite-plugin-pwa` (иконки 72–512 + maskable, workbox-offline-кэш,
  авто-регистрация SW), стаб push-уведомлений.

## Тесты

- **Vitest (unit/component)** — 48 тестов: wallet, qr, borsh, encoding,
  energyHistory, solana.formatAtomic, enrgTx (сериализация сверяется с Anchor
  из IDL **байт-в-байт**), parseEnergyProducer, а также Onboarding, Dashboard,
  Scanner, Settings.
- **Playwright E2E** — «Создать кошелёк → Отсканировать QR → Зарегистрировать
  устройство» (RPC devnet мокается route-перехватом, детерминированно).
- `npm run smoke` — эталонная сверка транзакций с @coral-xyz/anchor.

> Тестовые хаки: в `src/test/setup.ts` восстановлены Node-`Uint8Array`/`Buffer`
> (jsdom подменяет их на другой realm — это ломает web3.js) и заменён
> `PublicKey.findProgramAddress*` на реплику алгоритма с нативной проверкой
> кривой @noble/curves (в трансформе vitest `isOnCurve` перестаёт валидировать).


## Запуск

```bash
npm install

# Обычный dev (localhost):
npm run dev

# Нативный HTTPS в dev (для прямого доступа с телефона по LAN-IP:
# https://<LAN-IP>:5173, сначала принять самоподписанный сертификат):
npm run dev:https

# Проверка типов + production-сборка:
npm run build

# Тесты:
npm test          # Vitest: unit + компоненты (48 тестов)
npm run test:e2e  # Playwright: «Кошелёк → QR → Регистрация» (RPC мокается)
npm run smoke     # сериализация транзакций vs Anchor (байт-в-байт)
```

### Тестирование с телефона / ноутбука через туннель

> ⚠️ **Всегда используйте `npm run dev:phone`** (production-сборка + preview):
> localtunnel (free-тир) рейт-лимитит параллельные запросы (429/502).
> Vite-**dev** отдаёт каждый модуль отдельным запросом (`/src/*`,
> `/node_modules/.vite/deps/*`) — браузер ловит 502 на модулях и манифесте.
> Production-сборка — ~6 файлов на страницу, и лимит не срабатывает.

```bash
# ✅ РЕКОМЕНДУЕМЫЙ вариант (одна команда, всегда работает):
npm run dev:phone
# → сборка (~5с), затем: vite preview на :4173 + localtunnel
# → в логе "your url is: https://<subdomain>.loca.lt" — открыть на телефоне
```

Другие варианты (для локальной сети / особых случаев):

```bash
# Горячий dev + localtunnel: НЕ использовать через free-туннель
# (сотни модульных запросов → 502/429); подходит только для LAN-IP:
npm run dev:phone:hot

# Dev-сервер + cloudflared (HTTP/2; в некоторых WSL/сетях UDP/QUIC режется):
npm run dev:phone:cf
```

Порты: `server` → `:5173` (dev, HMR), `preview` → `:4173` (prod-превью).
Оба принимают произвольный `Host` туннеля (`allowedHosts: true`, только dev/preview).

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
