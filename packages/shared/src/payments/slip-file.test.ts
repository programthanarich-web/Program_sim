import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PaymentAdapterError } from "./errors";
import { buildSlipStoragePath, SLIP_MAX_BYTES, validateSlipFile } from "./slip-file";

const CUSTOMER_ID = "0f8e7d6c-5b4a-4321-9abc-def012345678";

function jpeg(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

function png(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function webp(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(Buffer.from("RIFF"), 0);
  bytes.set(Buffer.from("WEBP"), 8);
  return bytes;
}

function expectAdapterError(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => error instanceof PaymentAdapterError && error.code === code);
}

describe("validateSlipFile", () => {
  it("accepts JPEG, PNG and WebP by magic bytes and returns server-side hash", () => {
    assert.equal(validateSlipFile(jpeg()).mime, "image/jpeg");
    assert.equal(validateSlipFile(png()).mime, "image/png");
    const slip = validateSlipFile(webp());
    assert.equal(slip.mime, "image/webp");
    assert.equal(slip.extension, "webp");
    assert.match(slip.sha256, /^[0-9a-f]{64}$/);
    assert.equal(slip.sizeBytes, 64);
  });

  it("rejects executables, SVG, GIF and text even with an image extension or declared type", () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    expectAdapterError(() => validateSlipFile(exe), "unsupported_file_type");
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expectAdapterError(() => validateSlipFile(svg), "unsupported_file_type");
    const gif = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00");
    expectAdapterError(() => validateSlipFile(gif), "unsupported_file_type");
    expectAdapterError(() => validateSlipFile(exe, "image/png"), "unsupported_file_type");
  });

  it("rejects a declared type that does not match the content", () => {
    expectAdapterError(() => validateSlipFile(jpeg(), "image/png"), "unsupported_file_type");
    assert.equal(validateSlipFile(jpeg(), "image/jpeg").mime, "image/jpeg");
  });

  it("rejects empty files and files over 5 MB", () => {
    expectAdapterError(() => validateSlipFile(new Uint8Array(0)), "invalid_file");
    expectAdapterError(() => validateSlipFile(jpeg(SLIP_MAX_BYTES + 1)), "file_too_large");
    assert.equal(validateSlipFile(jpeg(SLIP_MAX_BYTES)).sizeBytes, SLIP_MAX_BYTES);
  });
});

describe("buildSlipStoragePath", () => {
  it("prefixes with the customer id and matches the database CHECK pattern", () => {
    const path = buildSlipStoragePath(CUSTOMER_ID, "jpg");
    assert.match(path, /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
    assert.equal(path.split("/")[0], CUSTOMER_ID);
  });

  it("never uses a client-supplied file name", () => {
    const first = buildSlipStoragePath(CUSTOMER_ID, "png");
    const second = buildSlipStoragePath(CUSTOMER_ID, "png");
    assert.notEqual(first, second);
  });

  it("rejects a customer id that is not a lowercase UUID", () => {
    expectAdapterError(() => buildSlipStoragePath("../etc", "jpg"), "invalid_file");
  });
});
