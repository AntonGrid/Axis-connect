/**
 * Drift guard for the bundled program IDL (`src/data/enrg_mvp.json`).
 *
 * The app builds instructions from this copy: `buildIxFromIdl` takes the account
 * order and the discriminator **from the IDL**, so a stale copy means a transaction
 * with wrong accounts and a confusing on-chain error.
 *
 * Why this guard exists (2026-09-16): the copy had not been refreshed since
 * 2026-08-21 while the contract grew from 48 to 58 instructions — `mint_energy` also
 * gained `producer_owner`, `oracle_quorum_config` and `attestation`. Nothing failed
 * loudly, because the five instructions this app builds happened to be unchanged; the
 * next change would have shipped a broken transaction.
 *
 * Refresh after any programme change: `npm run sync:idl`.
 *
 * The exact-match half needs the ENRG checkout (`../ENRG/idls/enrg_mvp.json`, or
 * `ENRG_IDL_PATH`); without it the suite skips with an explicit message instead of
 * failing, while the shape half always runs.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import bundled from "../data/enrg_mvp.json";
import { ENRG_PROGRAM_ID } from "../config";

const canonicalPath = process.env.ENRG_IDL_PATH
    ? path.resolve(process.env.ENRG_IDL_PATH)
    : path.resolve(process.cwd(), "../ENRG/idls/enrg_mvp.json");

const hasCanonical = fs.existsSync(canonicalPath);

/** Instructions this app actually builds (see enrgTx.ts / manifestVerification.ts). */
const BUILT_INSTRUCTIONS = [
    "register_device",
    "claim_device",
    "provision_device",
    "activate_device",
    "claim_rewards",
    "register_manifest_verification",
];

type IdlLike = {
    address: string;
    instructions: { name: string; discriminator: number[]; accounts: { name: string }[] }[];
};

const idl = bundled as unknown as IdlLike;

describe("bundled IDL (shape)", () => {
    it("points at the deployed enrg-mvp program", () => {
        expect(idl.address).toBe(ENRG_PROGRAM_ID.toBase58());
    });

    it("carries every instruction the app builds, with accounts", () => {
        for (const name of BUILT_INSTRUCTIONS) {
            const ix = idl.instructions.find((i) => i.name === name);
            expect(ix, `instruction missing from the bundled IDL: ${name}`).toBeDefined();
            expect(ix!.accounts.length, `${name} has no accounts`).toBeGreaterThan(0);
            expect(ix!.discriminator.length, `${name} has no discriminator`).toBe(8);
        }
    });

    it("is not older than the 2026-09-16 contract (58 instructions)", () => {
        expect(idl.instructions.length).toBeGreaterThanOrEqual(58);
    });
});

(hasCanonical ? describe : describe.skip)(
    `bundled IDL matches ${path.relative(process.cwd(), canonicalPath)}`,
    () => {
        const canonical = JSON.parse(fs.readFileSync(canonicalPath, "utf8")) as IdlLike;

        it("has the same instruction names", () => {
            const names = (x: IdlLike) => x.instructions.map((i) => i.name).sort();
            expect(names(idl)).toEqual(names(canonical));
        });

        it("is identical to the canonical file (run `npm run sync:idl`)", () => {
            expect(idl).toEqual(canonical as unknown as IdlLike);
        });
    }
);
