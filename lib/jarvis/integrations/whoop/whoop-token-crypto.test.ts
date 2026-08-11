import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WhoopTokenCryptoError,
  decryptWhoopAccessToken,
  decryptWhoopRefreshToken,
  encryptWhoopAccessToken,
  encryptWhoopRefreshToken,
  getWhoopEncryptionVersion,
} from "./whoop-token-crypto";

const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("whoop token crypto", () => {
  beforeEach(() => {
    process.env.WHOOP_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.WHOOP_TOKEN_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  it("1. encrypt/decrypt round trip for access and refresh tokens", () => {
    const access = "whoop-access-token-value";
    const refresh = "whoop-refresh-token-value";

    expect(decryptWhoopAccessToken(encryptWhoopAccessToken(access))).toBe(access);
    expect(decryptWhoopRefreshToken(encryptWhoopRefreshToken(refresh))).toBe(refresh);
  });

  it("2. same plaintext encrypts differently due to random IV", () => {
    const plaintext = "same-token";
    const first = encryptWhoopAccessToken(plaintext);
    const second = encryptWhoopAccessToken(plaintext);

    expect(first).not.toBe(second);
    expect(decryptWhoopAccessToken(first)).toBe(plaintext);
    expect(decryptWhoopAccessToken(second)).toBe(plaintext);
  });

  it("3. wrong key fails decryption", () => {
    const encrypted = encryptWhoopAccessToken("secret-token");
    process.env.WHOOP_TOKEN_ENCRYPTION_KEY =
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

    expect(() => decryptWhoopAccessToken(encrypted)).toThrow(WhoopTokenCryptoError);
    expect(() => decryptWhoopAccessToken(encrypted)).toThrow(/decryption_failed/);
  });

  it("4. tampered ciphertext fails", () => {
    const encrypted = encryptWhoopAccessToken("secret-token");
    const data = Buffer.from(encrypted, "base64url");
    data[14] ^= 0xff;
    const tampered = data.toString("base64url");

    expect(() => decryptWhoopAccessToken(tampered)).toThrow(WhoopTokenCryptoError);
  });

  it("5. malformed payload fails safely", () => {
    expect(() => decryptWhoopAccessToken("not-valid-base64url")).toThrow(
      WhoopTokenCryptoError,
    );
    expect(() => decryptWhoopAccessToken("YWJj")).toThrow(WhoopTokenCryptoError);
  });

  it("6. missing/invalid key produces safe configuration error", () => {
    delete process.env.WHOOP_TOKEN_ENCRYPTION_KEY;

    expect(() => encryptWhoopAccessToken("token")).toThrow(WhoopTokenCryptoError);
    expect(() => encryptWhoopAccessToken("token")).toThrow(/not configured/i);

    process.env.WHOOP_TOKEN_ENCRYPTION_KEY = "too-short";
    expect(() => encryptWhoopAccessToken("token")).toThrow(/invalid/i);
  });

  it("7. secret token values are never logged", () => {
    const secret = "super-secret-whoop-refresh-token";
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    encryptWhoopRefreshToken(secret);
    decryptWhoopRefreshToken(encryptWhoopRefreshToken(secret));

    for (const call of consoleSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secret);
    }

    expect(getWhoopEncryptionVersion()).toBe(1);
  });
});

describe("whoop token crypto module boundary", () => {
  it("is server-only", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "whoop-token-crypto.ts"),
      "utf8",
    );
    expect(source).toContain('import "server-only"');
  });
});
