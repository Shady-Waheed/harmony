import { describe, expect, it } from "vitest";
import {
  buildMemberLookupRequest,
  normalizeEmailForComparison,
  normalizeMemberRow,
  resolveMemberKey,
  isDuplicateMember,
} from "./teamMemberLookup.js";

describe("team member lookup helpers", () => {
  it("normalizes whitespace and case consistently", () => {
    expect(normalizeEmailForComparison("  Member@GoogleMail.com  ")).toBe(
      "member@gmail.com",
    );
  });

  it("builds the lookup request payload without client-trusted UID data", () => {
    const request = buildMemberLookupRequest({ email: " Member@Example.com " });
    expect(request).toEqual({ email: "Member@Example.com" });
  });

  it("creates a stable member row from a trusted backend result", () => {
    const row = normalizeMemberRow({
      uid: "uid-123",
      email: " member@example.com ",
      displayName: "Member Name",
      canEdit: true,
      canSaveFirebase: true,
      canDeleteHymn: false,
      canManageDashboard: false,
    });

    expect(row.uid).toBe("uid-123");
    expect(row.email).toBe("member@example.com");
    expect(row.displayName).toBe("Member Name");
  });

  it("detects duplicates by uid and email", () => {
    const existing = [
      { uid: "uid-1", email: "first@example.com" },
      { uid: "uid-2", email: "second@example.com" },
    ];

    expect(
      isDuplicateMember(existing, { uid: "uid-1", email: "other@example.com" }),
    ).toBe(true);
    expect(
      isDuplicateMember(existing, { uid: "uid-3", email: "first@example.com" }),
    ).toBe(true);
    expect(
      isDuplicateMember(existing, { uid: "uid-4", email: "new@example.com" }),
    ).toBe(false);
  });

  it("resolves a summary key for dedupe checks", () => {
    expect(resolveMemberKey({ uid: "uid-7", email: "User@Example.com" })).toBe(
      "uid-7|user@example.com",
    );
  });
});
