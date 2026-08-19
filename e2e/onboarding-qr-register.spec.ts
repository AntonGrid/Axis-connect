import { expect, test, type Page } from "@playwright/test";

/**
 * E2E: «Создать кошелёк → Отсканировать QR → Зарегистрировать устройство».
 *
 * RPC (devnet) и сетевые запросы к устройству перехватываются route-mock'ами,
 * поэтому сценарий детерминирован и не требует реальной сети/камеры:
 *  - QR вводится через ручной fallback (камера в headless недоступна);
 *  - регистрация идёт через ручной режим подписей (Serial SIGN), а
 *    sendTransaction/account-запросы мокаются на RPC-уровне.
 */

const DEVICE_ID = "AxJsXqX9YxD3pz2w7e7cJdQpP7oFg9vHsE9kX2vYjWmN";
const QR_PAYLOAD = JSON.stringify({ deviceId: DEVICE_ID, schema: "axis-energy-v1" });
// Валидные base58 (64-байтовая подпись / 32-байтовый блокхэш) — иначе
// web3.js не декодирует их и роняет E2E.
const FAKE_SIG =
  "45uZXcJpfu67vLx2ZdV1NSMe9QnG6J8dgAqSnbxgoVRC8sinycyMZaZqMZcz6V9CA8VJvY5wJsK9wL2kDmnJ16EY";
const BLOCKHASH = "3cAT2Zwgs44rGAawrNQF4h3KzApmMT9M18s32VL8prnA";

/** Generic JSON-RPC mock для devnet. */
async function mockRpc(page: Page) {
  await page.route("**/api.devnet.solana.com/**", async (route) => {
    const body = route.request().postDataJSON() as {
      id?: number;
      method?: string;
      params?: unknown[];
    };
    const id = body.id ?? 1;
    let result: unknown = null;

    switch (body.method) {
      case "getAccountInfo":
        result = { context: { slot: 1 }, value: null }; // Producer PDA не существует
        break;
      case "getBalance":
        result = { context: { slot: 1 }, value: 1_000_000_000 };
        break;
      case "getTokenAccountBalance":
        result = { context: { slot: 1 }, value: { amount: "0", decimals: 9, uiAmount: 0 } };
        break;
      case "getSignaturesForAddress":
        result = [];
        break;
      case "getParsedTransaction":
        result = null;
        break;
      case "getLatestBlockhash":
        result = { context: { slot: 1 }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1 } };
        break;
      case "getRecentBlockhash":
        result = { context: { slot: 1 }, value: { blockhash: BLOCKHASH, feeCalculator: { lamportsPerSignature: 5000 } } };
        break;
      case "getSignatureStatuses":
        result = {
          context: { slot: 2 },
          value: (body.params?.[0] as string[] | undefined)?.map(() => ({
            slot: 2,
            confirmations: null,
            err: null,
            confirmationStatus: "confirmed",
          })) ?? [],
        };
        break;
      case "sendTransaction":
        result = FAKE_SIG;
        break;
      case "requestAirdrop":
        result = FAKE_SIG;
        break;
      case "getMinimumBalanceForRentExemption":
        result = 890880;
        break;
      case "getSlot":
        result = 1;
        break;
      case "getVersion":
        result = { "solana-core": "1.18.0", "feature-set": 1 };
        break;
      case "getHealth":
        result = "ok";
        break;
      default:
        result = null;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jsonrpc: "2.0", id, result }),
    });
  });
}

async function createWallet(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Создать кошелёк" }).click();
  await expect(page.getByText("Кошелёк создан")).toBeVisible();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("heading", { name: "Энергия" })).toBeVisible();
}

async function scanQr(page: Page) {
  await page.getByRole("button", { name: /Добавить устройство/ }).click();
  await expect(page.getByRole("heading", { name: "Сканирование" })).toBeVisible();
  // Ручной fallback вместо камеры.
  await page.getByText("Ввести QR-код вручную").click();
  await page.getByPlaceholder(/deviceId/).fill(QR_PAYLOAD);
  await page.getByRole("button", { name: "Применить" }).click();
  await expect(page.getByText(new RegExp(`Устройство: ESP32-`))).toBeVisible();
  await page.getByRole("button", { name: "Подключить" }).click();
  await expect(page.getByRole("heading", { name: "Регистрация" })).toBeVisible();
}

async function registerDevice(page: Page) {
  await page.getByRole("button", { name: "Ручной режим (Serial SIGN)" }).click();
  await expect(page.getByText(/SIGN 656e72673a6465766963653a/).first()).toBeVisible();

  // Заполняем подписи (в RPC они мокаются — валидность не проверяется).
  const sigInputs = page.getByPlaceholder(/sig_hex/);
  const count = await sigInputs.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await sigInputs.nth(i).fill("ab".repeat(64));
  }
  await page.getByRole("button", { name: /Отправить с ручными подписями/ }).click();

  await expect(page.getByText("Устройство зарегистрировано и активно! 🎉")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "В дашборд" }).click();
  await expect(page.getByRole("heading", { name: "Устройства" })).toBeVisible();
  await expect(page.getByText(new RegExp(`ESP32-`))).toBeVisible();
}

test("Создать кошелёк → отсканировать QR → зарегистрировать устройство", async ({ page }) => {
  await mockRpc(page);
  await createWallet(page);
  await scanQr(page);
  await registerDevice(page);
});
