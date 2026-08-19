import { describe, expect, it } from "vitest";
import { ascii, concatBytes, i64le, u64le, u8 } from "../lib/borsh";

describe("borsh primitives", () => {
  it("u64le little-endian", () => {
    expect([...u64le(1n)]).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect([...u64le(0x0102030405060708n)]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("i64le negative", () => {
    expect([...i64le(-1n)]).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
  });

  it("u8 masks to byte", () => {
    expect([...u8(0x1ff)]).toEqual([0xff]);
  });

  it("ascii + concatBytes", () => {
    expect([...ascii("ab")]).toEqual([0x61, 0x62]);
    expect([...concatBytes(u8(1), u8(2), u8(3))]).toEqual([1, 2, 3]);
  });
});
