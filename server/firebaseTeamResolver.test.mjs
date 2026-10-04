import { describe, expect, it } from "vitest";
import {
  buildUidBackedMemberEntry,
  buildUidBackedTeamDocument,
  createResolvedMemberPreview,
  isServerAuthorizedTeamManager,
  normalizeEmailForComparison,
  resolveAuthUserByEmail,
} from "./firebaseTeamResolver.mjs";

describe("trusted server-side UID resolution", () => {
  it("normalizes email values consistently", () => {
    expect(normalizeEmailForComparison("  User@GoogleMail.com  ")).toBe(
      "user@gmail.com",
    );
    expect(normalizeEmailForComparison("Another@Example.com")).toBe(
      "another@example.com",
    );
  });

  it("rejects unauthorized team-manager requests", () => {
    const result = createResolvedMemberPreview({
      teamEmail: "member@example.com",
      authUsers: [
        {
          uid: "uid-1",
          email: "member@example.com",
          emailVerified: true,
          disabled: false,
        },
      ],
      requestUser: { uid: "not-admin", email: "guest@example.com" },
      teamData: { members: {} },
      adminEmails: ["admin@example.com"],
      adminUids: ["admin-uid"],
    });

    expect(result.authorized).toBe(false);
    expect(result.status).toBe("UNAUTHORIZED");
  });

  it("allows a valid authorized request to resolve a single match", () => {
    const result = createResolvedMemberPreview({
      teamEmail: "member@example.com",
      authUsers: [
        {
          uid: "uid-1",
          email: "member@example.com",
          emailVerified: true,
          disabled: false,
        },
      ],
      requestUser: {
        uid: "admin-uid",
        email: "admin@example.com",
        providerData: [],
      },
      teamData: { members: {} },
      adminEmails: ["admin@example.com"],
      adminUids: ["admin-uid"],
    });

    expect(result.authorized).toBe(true);
    expect(result.status).toBe("MATCHED");
    expect(result.authUser.uid).toBe("uid-1");
  });

  it("returns unknown email when no match exists", () => {
    const result = resolveAuthUserByEmail("missing@example.com", [
      {
        uid: "uid-1",
        email: "someone@example.com",
        emailVerified: true,
        disabled: false,
      },
    ]);

    expect(result.status).toBe("UNMATCHED");
    expect(result.reason).toBe("NO_MATCH");
  });

  it("marks duplicate normalized matches as ambiguous", () => {
    const result = resolveAuthUserByEmail("person@gmail.com", [
      {
        uid: "uid-1",
        email: "Person@Gmail.com",
        emailVerified: true,
        disabled: false,
      },
      {
        uid: "uid-2",
        email: "person@googlemail.com",
        emailVerified: true,
        disabled: false,
      },
    ]);

    expect(result.status).toBe("AMBIGUOUS");
    expect(result.candidates).toHaveLength(2);
  });

  it("preserves disabled and unverified account metadata", () => {
    const result = resolveAuthUserByEmail("user@example.com", [
      {
        uid: "uid-3",
        email: "user@example.com",
        emailVerified: false,
        disabled: true,
      },
    ]);

    expect(result.status).toBe("MATCHED");
    expect(result.authUser.emailVerified).toBe(false);
    expect(result.authUser.disabled).toBe(true);
  });

  it("does not trust client-supplied admin flags", () => {
    const authorized = isServerAuthorizedTeamManager({
      requestUser: {
        uid: "user-1",
        email: "user@example.com",
        providerData: [],
      },
      teamData: { members: {} },
      adminEmails: ["admin@example.com"],
      adminUids: [],
    });

    expect(authorized).toBe(false);
  });

  it("accepts a server-authorized member from team data when canManageDashboard is true", () => {
    const authorized = isServerAuthorizedTeamManager({
      requestUser: {
        uid: "member-uid",
        email: "member@example.com",
        providerData: [],
      },
      teamData: { members: { "member-uid": { canManageDashboard: true } } },
      adminEmails: [],
      adminUids: [],
    });

    expect(authorized).toBe(true);
  });

  it("builds a UID-backed team member entry without trusting client-supplied UID values", () => {
    const item = buildUidBackedMemberEntry({
      email: " member@example.com ",
      uid: "uid-123",
      permissions: {
        canEdit: true,
        canSaveFirebase: false,
        canDeleteHymn: true,
        canManageDashboard: false,
      },
    });

    expect(item.email).toBe("member@example.com");
    expect(item.uid).toBe("uid-123");
    expect(item.canEdit).toBe(true);
    expect(item.canDeleteHymn).toBe(true);
  });

  it("builds a UID-backed team document preserving existing members", () => {
    const doc = buildUidBackedTeamDocument(
      [{ uid: "old-uid", email: "old@example.com", canEdit: true }],
      { uid: "new-uid", email: "new@example.com", canEdit: true },
    );

    expect(doc.members["old-uid"].email).toBe("old@example.com");
    expect(doc.members["new-uid"].email).toBe("new@example.com");
    expect(doc.ignoreEnvAdminList).toBe(false);
  });
});
