import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canReadExclusiveHymn,
  canAccessTeamDashboard,
  canManageSetlists,
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
    expect(resolvePermissions(null, {}).canManageSetlists).toBe(false);
  });

  it("grants Rules-backed capabilities to bootstrap UIDs", () => {
    const user = {
      uid: "15dQtzmhFmTep92fBEg7jfkJ62I2",
      email: "bootstrap@example.com",
      providerData: [],
    };

    expect(isSuperAdminUser(user)).toBe(true);
    expect(canAccessTeamDashboard(user, {})).toBe(true);
    expect(canManageSetlists(user, {})).toBe(true);
    expect(resolvePermissions(user, {}).isAdmin).toBe(true);
    expect(resolvePermissions(user, {}).canSaveFirebase).toBe(true);
    expect(resolvePermissions(user, {}).canDelete).toBe(true);
  });

  it("recognizes both bootstrap Admin UIDs regardless of email", () => {
    for (const uid of ["15dQtzmhFmTep92fBEg7jfkJ62I2", "ADMIN_UID_2"]) {
      const user = { uid, email: "ordinary@example.com" };
      const permissions = resolvePermissions(user, {});

      expect(permissions.isSuperAdmin).toBe(true);
      expect(permissions.canSaveFirebase).toBe(true);
      expect(permissions.canDelete).toBe(true);
      expect(canReadExclusiveHymn(user, "another-owner")).toBe(true);
    }

    const nonAdmin = {
      uid: "ordinary-uid",
      email: "bootstrap@example.com",
    };
    expect(resolvePermissions(nonAdmin, {}).isSuperAdmin).toBe(false);
    expect(resolvePermissions(nonAdmin, {}).canSaveFirebase).toBe(false);
    expect(canReadExclusiveHymn(nonAdmin, "another-owner")).toBe(false);
  });

  it("allows exclusive reads for the owner but not other authenticated users", () => {
    expect(
      canReadExclusiveHymn({ uid: "exclusive-owner" }, "exclusive-owner"),
    ).toBe(true);
    expect(
      canReadExclusiveHymn({ uid: "other-user" }, "exclusive-owner"),
    ).toBe(false);
    expect(canReadExclusiveHymn(null, "exclusive-owner")).toBe(false);
  });

  it("resolves distinct permissions only from the UID-keyed team row", () => {
    const user = {
      uid: "member-uid",
      email: "member@example.com",
      providerData: [],
    };
    const teamData = {
      members: {
        "member-uid": {
          uid: "member-uid",
          email: "member@example.com",
          canEdit: true,
          canSaveFirebase: true,
          canDeleteHymn: false,
          canManageDashboard: false,
          canManageSetlists: true,
        },
      },
      ignoreEnvAdminList: false,
    };

    const perms = resolvePermissions(user, teamData);
    expect(perms.isAdmin).toBe(true);
    expect(perms.canSaveFirebase).toBe(true);
    expect(perms.canDelete).toBe(false);
    expect(perms.canManageSetlists).toBe(true);
  });

  it("does not authorize stale email rows or legacy member arrays", () => {
    const user = {
      uid: "current-uid",
      email: "member@example.com",
      providerData: [],
    };
    const emailKeyed = {
      members: {
        "old-uid": {
          uid: "old-uid",
          email: "member@example.com",
          canSaveFirebase: true,
          canManageDashboard: true,
          canManageSetlists: true,
        },
      },
    };
    const legacyArray = {
      members: [
        {
          uid: "current-uid",
          email: "member@example.com",
          canSaveFirebase: true,
          canManageDashboard: true,
          canManageSetlists: true,
        },
      ],
    };

    for (const teamData of [emailKeyed, legacyArray]) {
      expect(resolvePermissions(user, teamData).canSaveFirebase).toBe(false);
      expect(resolvePermissions(user, teamData).canManageSetlists).toBe(false);
      expect(canAccessTeamDashboard(user, teamData)).toBe(false);
      expect(canManageSetlists(user, teamData)).toBe(false);
    }
  });

  it("does not let unrelated permissions grant shared setlist management", () => {
    const user = { uid: "separate-role-user", email: "role@example.com" };
    const unrelatedFlags = {
      members: {
        "separate-role-user": {
          canEdit: true,
          canSaveFirebase: true,
          canDeleteHymn: true,
          canManageDashboard: true,
        },
      },
    };
    const explicitSetlistFlag = {
      members: {
        "separate-role-user": { canManageSetlists: true },
      },
    };

    expect(canManageSetlists(user, unrelatedFlags)).toBe(false);
    expect(resolvePermissions(user, unrelatedFlags).canManageSetlists).toBe(
      false,
    );
    expect(canManageSetlists(user, explicitSetlistFlag)).toBe(true);
  });

  it("keeps VITE admin lists UI-only and does not grant Rules capabilities", () => {
    const user = {
      uid: "env-editor-uid",
      email: "manager@example.com",
      providerData: [],
    };
    const permissions = resolvePermissions(user, {});

    expect(permissions.isAdmin).toBe(true);
    expect(permissions.canSaveFirebase).toBe(false);
    expect(permissions.canDelete).toBe(false);
    expect(permissions.canManageSetlists).toBe(false);
    expect(canAccessTeamDashboard(user, {})).toBe(false);
  });
});
