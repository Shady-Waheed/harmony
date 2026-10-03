import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canAccessTeamDashboard,
  isSuperAdminUser,
  resolvePermissions,
} from "./permissions.js";

describe("role matrix and permission resolution", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPER_ADMIN_EMAILS", "admin@example.com");
    vi.stubEnv("VITE_SUPER_ADMIN_UIDS", "super-uid-1");
    vi.stubEnv("VITE_ADMIN_EMAILS", "admin@example.com, manager@example.com");
    vi.stubEnv("VITE_ADMIN_UIDS", "admin-uid-1");
    vi.stubEnv("VITE_DELETE_EMAILS", "deleter@example.com");
    vi.stubEnv("VITE_DELETE_UIDS", "delete-uid-1");
    vi.stubEnv("VITE_SAVE_EMAILS", "saver@example.com");
    vi.stubEnv("VITE_SAVE_UIDS", "save-uid-1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats unauthenticated users as having no permissions", () => {
    expect(resolvePermissions(null, {}).isAdmin).toBe(false);
    expect(resolvePermissions(null, {}).canSaveFirebase).toBe(false);
    expect(resolvePermissions(null, {}).canDelete).toBe(false);
  });

  it("grants env-based super-admin privileges to the configured account", () => {
    const user = {
      uid: "super-uid-1",
      email: "admin@example.com",
      providerData: [],
    };

    expect(isSuperAdminUser(user)).toBe(true);
    expect(resolvePermissions(user, {}).isAdmin).toBe(true);
    expect(resolvePermissions(user, {}).canSaveFirebase).toBe(true);
    expect(resolvePermissions(user, {}).canDelete).toBe(true);
  });

  it("merges env-admin and team-row permissions without creating a new security layer", () => {
    const user = {
      uid: "member-uid",
      email: "member@example.com",
      providerData: [],
    };
    const teamData = {
      members: [
        {
          email: "member@example.com",
          canEdit: true,
          canSaveFirebase: true,
          canDeleteHymn: false,
          canManageDashboard: false,
        },
      ],
      ignoreEnvAdminList: false,
    };

    const perms = resolvePermissions(user, teamData);
    expect(perms.isAdmin).toBe(true);
    expect(perms.canSaveFirebase).toBe(true);
    expect(perms.canDelete).toBe(false);
  });

  it("allows team dashboard access only when the team row grants it", () => {
    vi.stubEnv("VITE_SUPER_ADMIN_EMAILS", "");
    vi.stubEnv("VITE_SUPER_ADMIN_UIDS", "");
    vi.stubEnv("VITE_ADMIN_EMAILS", "");
    vi.stubEnv("VITE_ADMIN_UIDS", "");

    const user = {
      uid: "dashboard-uid",
      email: "dashboard@example.com",
      providerData: [],
    };
    const teamData = {
      ignoreEnvAdminList: true,
      members: [
        {
          email: "dashboard@example.com",
          canManageDashboard: true,
        },
      ],
    };

    expect(canAccessTeamDashboard(user, teamData)).toBe(true);
  });
});
