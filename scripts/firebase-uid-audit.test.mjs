import { describe, expect, it } from "vitest";
import {
  normalizeEmailForComparison,
  reconcileTeamMembership,
  resolveExitCode,
} from "./firebase-uid-audit-core.mjs";

describe("firebase uid audit pure logic", () => {
  it("lowercases and trims email values", () => {
    expect(normalizeEmailForComparison("  User@Example.com  ")).toBe(
      "user@example.com",
    );
  });

  it("normalizes gmail and googlemail to the same value", () => {
    expect(normalizeEmailForComparison("user@googlemail.com")).toBe(
      "user@gmail.com",
    );
    expect(normalizeEmailForComparison("user@gmail.com")).toBe(
      "user@gmail.com",
    );
  });

  it("returns one exact match", () => {
    const result = reconcileTeamMembership(
      ["user@example.com"],
      [
        {
          uid: "uid-1",
          email: "User@Example.com",
          emailVerified: true,
          disabled: false,
          displayName: "User",
          providerIds: ["google.com"],
        },
      ],
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({
      teamEmail: "user@example.com",
      authEmail: "User@Example.com",
      uid: "uid-1",
    });
  });

  it("handles unmatched email", () => {
    const result = reconcileTeamMembership(
      ["missing@example.com"],
      [{ uid: "uid-1", email: "user@example.com" }],
    );
    expect(result.unmatchedTeamEmails).toEqual(["missing@example.com"]);
  });

  it("flags ambiguous duplicate matches", () => {
    const result = reconcileTeamMembership(
      ["person@gmail.com"],
      [
        {
          uid: "uid-1",
          email: "Person@Gmail.com",
          emailVerified: true,
          disabled: false,
          displayName: "A",
          providerIds: ["google.com"],
        },
        {
          uid: "uid-2",
          email: "person@googlemail.com",
          emailVerified: true,
          disabled: false,
          displayName: "B",
          providerIds: ["google.com"],
        },
      ],
    );

    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].teamEmail).toBe("person@gmail.com");
    expect(result.ambiguous[0].candidates).toHaveLength(2);
  });

  it("tracks auth users not in team", () => {
    const result = reconcileTeamMembership(
      ["team@example.com"],
      [{ uid: "uid-1", email: "other@example.com" }],
    );
    expect(result.authUsersNotInTeam).toHaveLength(1);
    expect(result.authUsersNotInTeam[0].uid).toBe("uid-1");
  });

  it("tracks auth users without email", () => {
    const result = reconcileTeamMembership(
      ["team@example.com"],
      [{ uid: "uid-1", email: null }],
    );
    expect(result.authUsersWithoutEmail).toHaveLength(1);
  });

  it("preserves disabled status on matched users", () => {
    const result = reconcileTeamMembership(
      ["user@example.com"],
      [
        {
          uid: "uid-1",
          email: "user@example.com",
          disabled: true,
          emailVerified: false,
          providerIds: ["google.com"],
        },
      ],
    );

    expect(result.matched[0].disabled).toBe(true);
    expect(result.matched[0].emailVerified).toBe(false);
  });

  it("preserves original email and normalized email separately", () => {
    const result = reconcileTeamMembership(
      ["user@example.com"],
      [
        {
          uid: "uid-1",
          email: "User@Example.com",
          emailVerified: true,
          disabled: false,
          displayName: "User",
          providerIds: ["google.com"],
        },
      ],
    );

    expect(result.matched[0]).toMatchObject({
      originalEmail: "User@Example.com",
      normalizedEmail: "user@example.com",
    });
  });

  it("does not mutate the input arrays", () => {
    const teamEmails = [" User@Example.com "];
    const authUsers = [{ uid: "uid-1", email: "user@example.com" }];

    const beforeTeam = [...teamEmails];
    const beforeAuth = [...authUsers];

    reconcileTeamMembership(teamEmails, authUsers);

    expect(teamEmails).toEqual(beforeTeam);
    expect(authUsers).toEqual(beforeAuth);
  });

  it("handles multiple team emails and multiple auth users", () => {
    const result = reconcileTeamMembership(
      ["a@example.com", "b@example.com", "c@example.com"],
      [
        { uid: "u1", email: "A@example.com" },
        { uid: "u2", email: "b@example.com" },
        { uid: "u3", email: "other@example.com" },
      ],
    );

    expect(result.matched).toHaveLength(2);
    expect(result.unmatchedTeamEmails).toEqual(["c@example.com"]);
  });

  it("classifies exit code for success, unresolved, and runtime failure", () => {
    expect(
      resolveExitCode({ matched: [], unmatchedTeamEmails: [], ambiguous: [] }),
    ).toBe(0);
    expect(
      resolveExitCode({
        matched: [],
        unmatchedTeamEmails: ["x@example.com"],
        ambiguous: [],
      }),
    ).toBe(2);
    expect(
      resolveExitCode({
        matched: [],
        unmatchedTeamEmails: [],
        ambiguous: [{ teamEmail: "x@example.com", candidates: ["u1"] }],
      }),
    ).toBe(2);
  });
});
