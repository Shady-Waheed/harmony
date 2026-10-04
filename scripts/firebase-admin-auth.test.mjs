import { describe, expect, it, vi } from "vitest";
import {
  getSafeCredentialFailureReason,
  resolveAdminCredentialSource,
} from "./firebase-admin-auth.mjs";

describe("Firebase Admin credential setup", () => {
  it("uses ADC when GOOGLE_APPLICATION_CREDENTIALS is missing", () => {
    expect(resolveAdminCredentialSource({ env: {} })).toEqual({
      kind: "application-default",
    });
  });

  it("rejects a configured credential path that does not exist", () => {
    const secretPath = "/private/credential-secret.json";
    const stat = vi.fn(() => {
      throw new Error(`ENOENT ${secretPath}`);
    });

    expect(() =>
      resolveAdminCredentialSource({
        env: { GOOGLE_APPLICATION_CREDENTIALS: secretPath },
        stat,
      }),
    ).toThrow(
      "GOOGLE_APPLICATION_CREDENTIALS must point to a readable credential file.",
    );
    expect(stat).toHaveBeenCalledWith(secretPath);
  });

  it("accepts a readable credential file without reading or exposing its contents", () => {
    const secretPath = "/private/service-account-secret.json";
    const stat = vi.fn(() => ({ isFile: () => true }));
    const access = vi.fn();

    expect(
      resolveAdminCredentialSource({
        env: { GOOGLE_APPLICATION_CREDENTIALS: secretPath },
        stat,
        access,
      }),
    ).toEqual({ kind: "configured-file", path: secretPath });
    expect(access).toHaveBeenCalledWith(secretPath, expect.any(Number));
  });

  it("does not include SDK messages, paths, tokens, or keys in safe errors", () => {
    const secret = "private-key-token-secret";
    const reason = getSafeCredentialFailureReason(
      new Error(`/private/path ${secret}`),
      "configured-file",
    );

    expect(reason).toBe(
      "The configured credential file could not authenticate with Firebase Admin.",
    );
    expect(reason).not.toContain(secret);
    expect(reason).not.toContain("/private/path");
  });
});
