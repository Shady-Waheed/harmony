import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cacheUserPermissions,
  resolvePermissionsWithOfflineCache,
} from "./permissionsCache.js";
import { resolvePermissions } from "./permissions.js";

describe("offline permission cache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("never lets cached write capabilities override current UID permissions", () => {
    vi.stubEnv("VITE_ADMIN_EMAILS", "");
    vi.stubEnv("VITE_ADMIN_UIDS", "");
    vi.stubEnv("VITE_SUPER_ADMIN_EMAILS", "");
    vi.stubEnv("VITE_SUPER_ADMIN_UIDS", "");
    const values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    });
    const user = {
      uid: "email-only-admin",
      email: "admin@example.com",
    };

    cacheUserPermissions(user, {
      isAdmin: true,
      canSaveFirebase: true,
      canDelete: true,
      isSuperAdmin: true,
    });

    const permissions = resolvePermissionsWithOfflineCache(
      user,
      {},
      resolvePermissions,
      false,
    );

    expect(permissions.isAdmin).toBe(true);
    expect(permissions.canSaveFirebase).toBe(false);
    expect(permissions.canDelete).toBe(false);
    expect(permissions.isSuperAdmin).toBe(false);
  });
});
