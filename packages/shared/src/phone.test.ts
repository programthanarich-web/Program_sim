import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskPhone, normalizeThaiPhone, toE164Thai } from "./phone";

describe("normalizeThaiPhone", () => {
  it("accepts common Thai mobile formats and returns 10 digits", () => {
    assert.equal(normalizeThaiPhone("081-234-5678"), "0812345678");
    assert.equal(normalizeThaiPhone("+66812345678"), "0812345678");
    assert.equal(normalizeThaiPhone("66812345678"), "0812345678");
  });

  it("rejects non-mobile or malformed numbers", () => {
    assert.equal(normalizeThaiPhone("021234567"), null);
    assert.equal(normalizeThaiPhone("0712345678"), null);
    assert.equal(normalizeThaiPhone("08123"), null);
  });
});

describe("toE164Thai", () => {
  it("converts a local Thai number to +66 format", () => {
    assert.equal(toE164Thai("0812345678"), "+66812345678");
  });
});

describe("maskPhone", () => {
  it("never returns the full number", () => {
    assert.equal(maskPhone("0812345678"), "081-XXX-X678");
  });
});
