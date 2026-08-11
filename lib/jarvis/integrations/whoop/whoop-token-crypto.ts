import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_VERSION = 1;

export class WhoopTokenCryptoError extends Error {
  readonly code: "not_configured" | "decryption_failed";

  constructor(code: "not_configured" | "decryption_failed", message?: string) {
    super(message ?? code);
    this.name = "WhoopTokenCryptoError";
    this.code = code;
  }
}

function getEncryptionKey(): Buffer {
  const keyHex = process.env.WHOOP_TOKEN_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new WhoopTokenCryptoError(
      "not_configured",
      "WHOOP token encryption is not configured",
    );
  }

  const key = Buffer.from(keyHex, "hex");

  if (key.length !== 32) {
    throw new WhoopTokenCryptoError(
      "not_configured",
      "WHOOP token encryption key is invalid",
    );
  }

  return key;
}

export function getWhoopEncryptionVersion(): number {
  return ENCRYPTION_VERSION;
}

function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

function decryptToken(encoded: string): string {
  try {
    const key = getEncryptionKey();
    const data = Buffer.from(encoded, "base64url");

    if (data.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error("Invalid encrypted payload");
    }

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof WhoopTokenCryptoError) {
      throw error;
    }

    throw new WhoopTokenCryptoError("decryption_failed");
  }
}

export function encryptWhoopAccessToken(plaintext: string): string {
  return encryptToken(plaintext);
}

export function decryptWhoopAccessToken(encoded: string): string {
  return decryptToken(encoded);
}

export function encryptWhoopRefreshToken(plaintext: string): string {
  return encryptToken(plaintext);
}

export function decryptWhoopRefreshToken(encoded: string): string {
  return decryptToken(encoded);
}
