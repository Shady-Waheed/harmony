import { describe, expect, it } from "vitest";
import {
  buildUidBackedMemberEntry,
  buildUidBackedTeamDocument,
  createResolvedMemberPreview,
  isServerAuthorizedTeamManager,
  normalizeEmailForComparison,
  parseBootstrapAdminUids,
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
      bootstrapAdminUids: ["admin-uid"],
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
        email: "changed@example.net",
        providerData: [],
      },
      teamData: { members: {} },
      bootstrapAdminUids: ["admin-uid"],
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

  it("parses bootstrap UID configuration safely", () => {
    expect(parseBootstrapAdminUids(" uid-1, ,uid-2,uid-1 ,, ")).toEqual([
      "uid-1",
      "uid-2",
    ]);
    expect(parseBootstrapAdminUids(" ,  ")).toEqual([]);
  });

  it("authorizes an exact bootstrap UID", () => {
    expect(
      isServerAuthorizedTeamManager({
        requestUser: { uid: "bootstrap-uid" },
        teamData: {},
        bootstrapAdminUids: ["bootstrap-uid"],
      }),
    ).toBe(true);
  });

  it("denies a non-bootstrap UID regardless of matching email", () => {
    expect(
      isServerAuthorizedTeamManager({
        requestUser: {
          uid: "different-uid",
          email: "admin@example.com",
          providerData: [{ email: "bootstrap@example.com" }],
        },
        teamData: { members: {} },
        bootstrapAdminUids: ["bootstrap-uid"],
      }),
    ).toBe(false);
  });

  it("authorizes a bootstrap UID when its email changes", () => {
    expect(
      isServerAuthorizedTeamManager({
        requestUser: { uid: "bootstrap-uid", email: "changed@example.com" },
        teamData: {},
        bootstrapAdminUids: ["bootstrap-uid"],
      }),
    ).toBe(true);
  });

  it("authorizes a team manager by UID and literal boolean true", () => {
    expect(
      isServerAuthorizedTeamManager({
        requestUser: { uid: "manager-uid" },
        teamData: {
          members: {
            "manager-uid": { canManageDashboard: true },
          },
        },
      }),
    ).toBe(true);
  });

  it.each([
    ["false", false],
    ["string true", "true"],
    ["number one", 1],
    ["yes string", "yes"],
    ["missing flag", undefined],
  ])("denies a team row with %s canManageDashboard", (_label, flag) => {
    const member = { uid: "manager-uid" };
    if (flag !== undefined) member.canManageDashboard = flag;

    expect(
      isServerAuthorizedTeamManager({
        requestUser: { uid: "manager-uid" },
        teamData: { members: { "manager-uid": member } },
      }),
    ).toBe(false);
  });

  it("does not authorize legacy email-keyed rows", () => {
    expect(
      isServerAuthorizedTeamManager({
        requestUser: { uid: "manager-uid", email: "manager@example.com" },
        teamData: {
          members: {
            "manager@example.com": {
              email: "manager@example.com",
              canManageDashboard: true,
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("does not authorize a different UID with the manager email", () => {
    expect(
      isServerAuthorizedTeamManager({
        requestUser: { uid: "caller-uid", email: "manager@example.com" },
        teamData: {
          members: {
            "manager-uid": {
              uid: "manager-uid",
              email: "manager@example.com",
              canManageDashboard: true,
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("authorizes a bootstrap UID without any team document", () => {
    expect(
      isServerAuthorizedTeamManager({
        requestUser: { uid: "bootstrap-uid" },
        teamData: null,
        bootstrapAdminUids: ["bootstrap-uid"],
      }),
    ).toBe(true);
  });

  it("authorizes a team manager without bootstrap membership", () => {
    expect(
      isServerAuthorizedTeamManager({
        requestUser: { uid: "team-manager" },
        teamData: {
          members: { "team-manager": { canManageDashboard: true } },
        },
        bootstrapAdminUids: ["bootstrap-uid"],
      }),
    ).toBe(true);
  });

  it("denies a caller who is neither bootstrap nor a team manager", () => {
    expect(
      isServerAuthorizedTeamManager({
        requestUser: { uid: "ordinary-user" },
        teamData: { members: {} },
        bootstrapAdminUids: ["bootstrap-uid"],
      }),
    ).toBe(false);
  });

  it.each([
    ["missing auth", null],
    ["missing UID", {}],
    ["empty UID", { uid: "" }],
    ["whitespace UID", { uid: "   " }],
    ["non-string UID", { uid: 123 }],
  ])("denies %s", (_label, requestUser) => {
    expect(
      isServerAuthorizedTeamManager({
        requestUser,
        teamData: { members: {} },
        bootstrapAdminUids: ["123"],
      }),
    ).toBe(false);
  });

  it("does not trust client-supplied admin flags", () => {
    const authorized = isServerAuthorizedTeamManager({
      requestUser: {
        uid: "user-1",
        email: "user@example.com",
        providerData: [],
      },
      teamData: { members: {} },
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
        canManageSetlists: true,
      },
    });

    expect(item.email).toBe("member@example.com");
    expect(item.uid).toBe("uid-123");
    expect(item.canEdit).toBe(true);
    expect(item.canDeleteHymn).toBe(true);
    expect(item.canManageSetlists).toBe(true);
  });

  it("does not coerce malformed permission values to true", () => {
    const item = buildUidBackedMemberEntry({
      uid: "uid-123",
      permissions: {
        canEdit: "true",
        canSaveFirebase: 1,
        canDeleteHymn: "yes",
        canManageDashboard: "true",
        canManageSetlists: 1,
      },
    });

    expect(item).toMatchObject({
      canEdit: false,
      canSaveFirebase: false,
      canDeleteHymn: false,
      canManageDashboard: false,
      canManageSetlists: false,
    });
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
