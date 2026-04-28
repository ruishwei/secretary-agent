import { safeStorage } from "electron";

/**
 * Encrypts a value using Electron's safeStorage.
 * Falls back to base64 encoding on platforms without safeStorage.
 */
export function encryptValue(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(value);
    return encrypted.toString("base64");
  }
  // Fallback: base64 encode (not truly secure, but better than plaintext)
  return Buffer.from(value).toString("base64");
}

/**
 * Decrypts a value that was encrypted with encryptValue.
 */
export function decryptValue(encrypted: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const buffer = Buffer.from(encrypted, "base64");
    return safeStorage.decryptString(buffer);
  }
  // Fallback
  return Buffer.from(encrypted, "base64").toString("utf-8");
}
