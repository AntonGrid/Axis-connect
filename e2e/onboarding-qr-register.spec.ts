import { expect, test, type Page } from "@playwright/test";

/**
 * E2E: "Create wallet → Scan QR → Register the device".
 *
 * RPC (devnet) and network requests to the device are intercepted with route
 * mocks, so the scenario is deterministic and needs no real network/camera:
 *  - the QR is entered via the manual fallback (no camera in headless);
 *  - registration runs in the manual signature mode (Serial SIGN), while
 *    sendTransaction/account requests are mocked at the RPC level.
 */

const DEVICE_ID = "AxJsXqX9YxD3pz2w7e7cJdQpP7oFg9vHsE9kX2vYjWmN";
const QR_PAYLOAD = JSON.stringify({ deviceId: DEVICE_ID, schema: "axis-energy-v1" });
// Valid base58 (64-byte signature / 32-byte blockhash) — otherwise
// web3.js cannot decode them and the E2E fails.
const FAKE_SIG =
  "45uZXcJpfu67vLx2ZdV1NSMe9QnG6J8dgAqSnbxgoVRC8sinycyMZaZqMZcz6V9CA8VJvY5wJsK9wL2kDmnJ16EY";
const BLOCKHASH = "3cAT2Zwgs44rGAawrNQF4h3KzApmMT9M18s32VL8prnA";

/** Generic JSON-RPC mock for devnet. */
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
        result = { context: { slot: 1 }, value: null }; // Producer PDA does not exist
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
  await page.getByRole("button", { name: "Create wallet" }).click();
  await expect(page.getByText("Wallet created")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Energy" })).toBeVisible();
}

async function scanQr(page: Page) {
  await page.getByRole("button", { name: /Add device/ }).click();
  await expect(page.getByRole("heading", { name: "Scan" })).toBeVisible();
  // Manual fallback instead of the camera.
  await page.getByText("Enter QR code manually").click();
  await page.getByPlaceholder(/deviceId/).fill(QR_PAYLOAD);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(new RegExp(`Device: ESP32-`))).toBeVisible();
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("heading", { name: "Registration" })).toBeVisible();
}

async function registerDevice(page: Page) {
  await page.getByRole("button", { name: "Manual mode (Serial SIGN)" }).click();
  await expect(page.getByText(/SIGN 656e72673a6465766963653a/).first()).toBeVisible();

  // Fill in the signatures (mocked in RPC — validity is not checked).
  const sigInputs = page.getByPlaceholder(/sig_hex/);
  const count = await sigInputs.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    await sigInputs.nth(i).fill("ab".repeat(64));
  }
  await page.getByRole("button", { name: /Send with manual signatures/ }).click();

  await expect(page.getByText("Device registered and active! 🎉")).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "To dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Devices" })).toBeVisible();
  await expect(page.getByText(new RegExp(`ESP32-`))).toBeVisible();
}

test("Create wallet → scan QR → register the device", async ({ page }) => {
  await mockRpc(page);
  await createWallet(page);
  await scanQr(page);
  await registerDevice(page);
});
