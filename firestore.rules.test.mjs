import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const projectId = "demo-harmony-notes";
const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

let testEnv;

const describeRules = emulatorEnabled ? describe : describe.skip;

if (emulatorEnabled) {
  beforeEach(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        rules: readFileSync("./firestore.rules", "utf8"),
      },
    });
  });

  afterEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
      await testEnv.cleanup();
    }
  });
}

function authedDb(uid, email = `${uid}@example.com`) {
  return testEnv
    .authenticatedContext(uid, {
      email,
      email_verified: true,
    })
    .firestore();
}

const bootstrapAdminDb = () =>
  testEnv
    .authenticatedContext("ADMIN_UID_1", {
      email: "bootstrap@example.com",
      email_verified: true,
    })
    .firestore();

async function setTeamMembership({
  uid,
  email = `${uid}@example.com`,
  flags = {},
}) {
  const admin = bootstrapAdminDb();
  const existing = await admin.collection("settings").doc("team").get();

  if (!existing.exists) {
    await assertSucceeds(
      admin.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );
  }

  const db = authedDb(uid, email);
  await assertSucceeds(
    admin
      .collection("settings")
      .doc("team")
      .update({
        members: {
          ...(existing.exists && existing.data()
            ? existing.data().members || {}
            : {}),
          [uid]: {
            uid,
            email,
            ...flags,
          },
        },
      }),
  );
  return db;
}

async function seedHymn(id, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("hymns").doc(id).set(data);
  });
}

async function seedSetlist(id, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("setlists").doc(id).set(data);
  });
}

describeRules("Firestore Rules: UID-keyed team authorization", () => {
  it("allows public hymn reads and denies exclusive reads to non-owners", async () => {
    const admin = bootstrapAdminDb();
    await assertSucceeds(
      admin.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );

    const editor = await setTeamMembership({
      uid: "editor-uid",
      email: "editor@example.com",
      flags: { canSaveFirebase: true },
    });

    await assertSucceeds(
      editor.collection("hymns").doc("public-hymn").set({
        title: "Public hymn",
        key: "C",
        sections: [],
        ownerUid: "editor-uid",
        createdBy: "editor-uid",
        updatedBy: "editor-uid",
        isExclusive: false,
        exclusiveOwnerUid: "",
      }),
    );

    const anon = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(anon.collection("hymns").doc("public-hymn").get());

    await assertSucceeds(
      editor.collection("hymns").doc("exclusive-hymn").set({
        title: "Exclusive hymn",
        key: "D",
        sections: [],
        ownerUid: "editor-uid",
        createdBy: "editor-uid",
        updatedBy: "editor-uid",
        isExclusive: true,
        exclusiveOwnerUid: "editor-uid",
      }),
    );

    await assertFails(anon.collection("hymns").doc("exclusive-hymn").get());
  });

  it("denies hymn creation for canEdit-only members", async () => {
    const admin = bootstrapAdminDb();
    await assertSucceeds(
      admin.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );

    const unauthEditor = authedDb("guest-uid", "guest@example.com");
    await assertFails(
      unauthEditor.collection("hymns").doc("guest-write").set({
        title: "Guest",
        key: "G",
        sections: [],
        ownerUid: "guest-uid",
        createdBy: "guest-uid",
        updatedBy: "guest-uid",
        isExclusive: false,
        exclusiveOwnerUid: "",
      }),
    );

    const editor = await setTeamMembership({
      uid: "member-uid",
      email: "member@example.com",
      flags: { canEdit: true },
    });

    await assertFails(
      editor.collection("hymns").doc("allowed-write").set({
        title: "Allowed",
        key: "A",
        sections: [],
        ownerUid: "member-uid",
        createdBy: "member-uid",
        updatedBy: "member-uid",
        isExclusive: false,
        exclusiveOwnerUid: "",
      }),
    );
  });

  it("denies hymn creation for an ordinary member with no permission flags", async () => {
    const member = await setTeamMembership({
      uid: "ordinary-hymn-member",
      flags: {},
    });
    await assertFails(
      member.collection("hymns").doc("ordinary-member-write").set({
        title: "Ordinary member",
        key: "B",
        sections: [],
        ownerUid: "ordinary-hymn-member",
        createdBy: "ordinary-hymn-member",
        updatedBy: "ordinary-hymn-member",
        isExclusive: false,
        exclusiveOwnerUid: "",
      }),
    );
  });

  it("allows hymn creation for canSaveFirebase members", async () => {
    const admin = bootstrapAdminDb();
    await assertSucceeds(
      admin.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );
    const saver = await setTeamMembership({
      uid: "saver-uid",
      email: "saver@example.com",
      flags: { canSaveFirebase: true },
    });
    await assertSucceeds(
      saver.collection("hymns").doc("allowed-write").set({
        title: "Allowed",
        key: "A",
        sections: [],
        ownerUid: "saver-uid",
        createdBy: "saver-uid",
        updatedBy: "saver-uid",
        isExclusive: false,
        exclusiveOwnerUid: "",
      }),
    );
  });

  it("allows team dashboard managers to update the team document using request.auth.uid", async () => {
    const admin = bootstrapAdminDb();
    await assertSucceeds(
      admin.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );

    const manager = await setTeamMembership({
      uid: "manager-uid",
      email: "manager@example.com",
      flags: { canManageDashboard: true },
    });

    await assertSucceeds(
      manager.collection("settings").doc("team").update({
        ignoreEnvAdminList: true,
      }),
    );
  });

  it("allows setlist management by canManageSetlists and enforces owner and updatedBy rules", async () => {
    const admin = bootstrapAdminDb();
    await assertSucceeds(
      admin.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );

    const owner = await setTeamMembership({
      uid: "setlist-owner-uid",
      email: "setlist-owner@example.com",
      flags: { canManageSetlists: true },
    });

    await assertSucceeds(
      owner
        .collection("setlists")
        .doc("setlist-1")
        .set({
          schemaVersion: 1,
          name: "Sunday service",
          hymnIds: ["h1", "h2"],
          ownerUid: "setlist-owner-uid",
          createdBy: "setlist-owner-uid",
          updatedBy: "setlist-owner-uid",
        }),
    );

    await assertFails(
      owner.collection("setlists").doc("setlist-1").update({
        ownerUid: "another-user",
      }),
    );

    await assertFails(
      owner.collection("setlists").doc("setlist-1").update({
        createdBy: "another-user",
      }),
    );

    await assertSucceeds(
      owner
        .collection("setlists")
        .doc("setlist-1")
        .update({
          hymnIds: ["h1"],
          updatedBy: "setlist-owner-uid",
        }),
    );
  });

  it("preserves bootstrap admin behavior without email-based auth checks", async () => {
    const bootstrapAdmin = testEnv
      .authenticatedContext("ADMIN_UID_1", {
        email: "bootstrap@example.com",
        email_verified: true,
      })
      .firestore();

    await assertSucceeds(
      bootstrapAdmin.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );

    await assertSucceeds(
      bootstrapAdmin.collection("hymns").doc("admin-hymn").set({
        title: "Bootstrap admin",
        key: "F",
        sections: [],
        ownerUid: "ADMIN_UID_1",
        createdBy: "ADMIN_UID_1",
        updatedBy: "ADMIN_UID_1",
        isExclusive: false,
        exclusiveOwnerUid: "",
      }),
    );
  });

  it("denies missing or non-boolean permissions values", async () => {
    const admin = bootstrapAdminDb();
    await assertSucceeds(
      admin.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );

    const badMember = authedDb("bad-uid", "bad@example.com");
    await assertSucceeds(
      admin
        .collection("settings")
        .doc("team")
        .update({
          members: {
            "bad-uid": {
              uid: "bad-uid",
              email: "bad@example.com",
              canEdit: "yes",
            },
          },
        }),
    );

    await assertFails(
      badMember.collection("hymns").doc("bad-perms").set({
        title: "Bad perms",
        key: "B",
        sections: [],
        ownerUid: "bad-uid",
        createdBy: "bad-uid",
        updatedBy: "bad-uid",
        isExclusive: false,
        exclusiveOwnerUid: "",
      }),
    );
  });

  it("rejects legacy array team membership because it cannot grant UID-based permission", async () => {
    const admin = bootstrapAdminDb();
    await assertSucceeds(
      admin.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );

    const legacyMember = authedDb("legacy-uid", "legacy@example.com");

    await assertFails(
      admin
        .collection("settings")
        .doc("team")
        .update({
          members: [
            {
              uid: "legacy-uid",
              email: "legacy@example.com",
              canEdit: true,
            },
          ],
        }),
    );

    await assertFails(
      legacyMember.collection("hymns").doc("legacy-write").set({
        title: "No legacy write",
        key: "E",
        sections: [],
        ownerUid: "legacy-uid",
        createdBy: "legacy-uid",
        updatedBy: "legacy-uid",
        isExclusive: false,
        exclusiveOwnerUid: "",
      }),
    );
  });

  it("keeps the team doc map keyed by uid instead of email or array rows", async () => {
    const admin = bootstrapAdminDb();
    await assertSucceeds(
      admin.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );

    const scoped = authedDb("uid-keyed-user", "uid-keyed@example.com");

    await assertSucceeds(
      admin
        .collection("settings")
        .doc("team")
        .update({
          members: {
            "uid-keyed-user": {
              uid: "uid-keyed-user",
              email: "uid-keyed@example.com",
              canManageDashboard: true,
            },
          },
        }),
    );

    const teamSnap = await scoped.collection("settings").doc("team").get();

    expect(teamSnap.data().members["uid-keyed-user"]).toMatchObject({
      uid: "uid-keyed-user",
      email: "uid-keyed@example.com",
      canManageDashboard: true,
    });
  });

  it("enforces separate hymn save and delete permissions", async () => {
    const saver = await setTeamMembership({
      uid: "save-only-uid",
      flags: { canSaveFirebase: true },
    });
    await seedHymn("owned-by-someone-else", {
      title: "Protected",
      key: "C",
      sections: [],
      ownerUid: "other-owner",
      createdBy: "other-owner",
      updatedBy: "other-owner",
      isExclusive: false,
      exclusiveOwnerUid: "",
    });
    await assertSucceeds(
      saver.collection("hymns").doc("owned-by-someone-else").update({
        title: "Saved by content permission",
        updatedBy: "save-only-uid",
      }),
    );
    await assertFails(
      saver.collection("hymns").doc("owned-by-someone-else").delete(),
    );

    const deleter = await setTeamMembership({
      uid: "delete-only-uid",
      flags: { canDeleteHymn: true },
    });
    await seedHymn("delete-allowed", {
      title: "Delete permission",
      key: "D",
      sections: [],
      ownerUid: "other-owner",
      createdBy: "other-owner",
      updatedBy: "other-owner",
      isExclusive: false,
      exclusiveOwnerUid: "",
    });
    await assertSucceeds(
      deleter.collection("hymns").doc("delete-allowed").delete(),
    );

    const noDeletePermission = await setTeamMembership({
      uid: "no-delete-uid",
      flags: { canSaveFirebase: true },
    });
    await seedHymn("delete-denied", {
      title: "No delete permission",
      key: "E",
      sections: [],
      ownerUid: "other-owner",
      createdBy: "other-owner",
      updatedBy: "other-owner",
      isExclusive: false,
      exclusiveOwnerUid: "",
    });
    await assertFails(
      noDeletePermission.collection("hymns").doc("delete-denied").delete(),
    );

    const ownerWithoutDeleteFlag = authedDb("owner-without-delete");
    await seedHymn("owner-delete-denied", {
      title: "Owner without delete flag",
      key: "F",
      sections: [],
      ownerUid: "owner-without-delete",
      createdBy: "owner-without-delete",
      updatedBy: "owner-without-delete",
      isExclusive: false,
      exclusiveOwnerUid: "",
    });
    await assertFails(
      ownerWithoutDeleteFlag
        .collection("hymns")
        .doc("owner-delete-denied")
        .delete(),
    );
  });

  it("does not let canEdit-only members update hymn content", async () => {
    const editor = await setTeamMembership({
      uid: "edit-only-updater",
      flags: { canEdit: true },
    });
    await seedHymn("edit-only-update", {
      title: "Original",
      key: "C",
      sections: [],
      ownerUid: "edit-only-updater",
      createdBy: "edit-only-updater",
      updatedBy: "edit-only-updater",
      isExclusive: false,
      exclusiveOwnerUid: "",
    });
    await assertFails(
      editor.collection("hymns").doc("edit-only-update").update({
        title: "Changed",
        updatedBy: "edit-only-updater",
      }),
    );
  });

  it("does not let canDeleteHymn-only members create or update hymns", async () => {
    const deleter = await setTeamMembership({
      uid: "delete-only-writer",
      flags: { canDeleteHymn: true },
    });
    await seedHymn("delete-only-update", {
      title: "Original",
      key: "C",
      sections: [],
      ownerUid: "another-owner",
      createdBy: "another-owner",
      updatedBy: "another-owner",
      isExclusive: false,
      exclusiveOwnerUid: "",
    });
    await assertFails(
      deleter.collection("hymns").doc("delete-only-create").set({
        title: "Must not create",
        key: "D",
        sections: [],
        ownerUid: "delete-only-writer",
        createdBy: "delete-only-writer",
        updatedBy: "delete-only-writer",
        isExclusive: false,
        exclusiveOwnerUid: "",
      }),
    );
    await assertFails(
      deleter.collection("hymns").doc("delete-only-update").update({
        title: "Must not update",
        updatedBy: "delete-only-writer",
      }),
    );
  });

  it("denies access to exclusive hymns except for their UID owner", async () => {
    const owner = authedDb("exclusive-owner");
    const otherUser = authedDb("exclusive-reader");
    const anon = testEnv.unauthenticatedContext().firestore();
    await seedHymn("exclusive-read", {
      title: "Exclusive",
      key: "G",
      sections: [],
      ownerUid: "exclusive-owner",
      createdBy: "exclusive-owner",
      updatedBy: "exclusive-owner",
      isExclusive: true,
      exclusiveOwnerUid: "exclusive-owner",
    });

    await assertSucceeds(owner.collection("hymns").doc("exclusive-read").get());
    await assertFails(
      otherUser.collection("hymns").doc("exclusive-read").get(),
    );
    await assertFails(anon.collection("hymns").doc("exclusive-read").get());
  });

  it("does not treat missing or malformed isExclusive values as public", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await seedHymn("missing-exclusive-flag", {
      title: "Missing visibility",
      key: "C",
      sections: [],
      ownerUid: "owner",
      createdBy: "owner",
      updatedBy: "owner",
    });
    await seedHymn("malformed-exclusive-flag", {
      title: "Malformed visibility",
      key: "D",
      sections: [],
      ownerUid: "owner",
      createdBy: "owner",
      updatedBy: "owner",
      isExclusive: "false",
    });

    await assertFails(
      anon.collection("hymns").doc("missing-exclusive-flag").get(),
    );
    await assertFails(
      anon.collection("hymns").doc("malformed-exclusive-flag").get(),
    );
  });

  it("prevents a content saver from making another owner's exclusive hymn public", async () => {
    const saver = await setTeamMembership({
      uid: "exclusive-saver",
      flags: { canSaveFirebase: true },
    });
    await seedHymn("exclusive-downgrade", {
      title: "Keep exclusive",
      key: "A",
      sections: [],
      ownerUid: "exclusive-owner",
      createdBy: "exclusive-owner",
      updatedBy: "exclusive-owner",
      isExclusive: true,
      exclusiveOwnerUid: "exclusive-owner",
    });

    await assertFails(
      saver.collection("hymns").doc("exclusive-downgrade").update({
        isExclusive: false,
        updatedBy: "exclusive-saver",
      }),
    );
    await seedHymn("exclusive-transfer", {
      title: "Keep owner",
      key: "B",
      sections: [],
      ownerUid: "exclusive-owner",
      createdBy: "exclusive-owner",
      updatedBy: "exclusive-owner",
      isExclusive: true,
      exclusiveOwnerUid: "exclusive-owner",
    });
    await assertFails(
      saver.collection("hymns").doc("exclusive-transfer").update({
        exclusiveOwnerUid: "new-exclusive-owner",
        updatedBy: "exclusive-saver",
      }),
    );
  });

  it("allows the exclusive owner to update or release their exclusive hymn", async () => {
    const owner = await setTeamMembership({
      uid: "exclusive-owner-editor",
      flags: { canSaveFirebase: true },
    });
    await seedHymn("owner-exclusive-update", {
      title: "Owner content",
      key: "C",
      sections: [],
      ownerUid: "exclusive-owner-editor",
      createdBy: "exclusive-owner-editor",
      updatedBy: "exclusive-owner-editor",
      isExclusive: true,
      exclusiveOwnerUid: "exclusive-owner-editor",
    });

    await assertSucceeds(
      owner.collection("hymns").doc("owner-exclusive-update").update({
        title: "Owner update",
        isExclusive: false,
        exclusiveOwnerUid: "",
        updatedBy: "exclusive-owner-editor",
      }),
    );
  });

  it("allows bootstrap admins to administer exclusive hymn ownership", async () => {
    const admin = bootstrapAdminDb();
    await seedHymn("bootstrap-exclusive-update", {
      title: "Admin-managed exclusive",
      key: "D",
      sections: [],
      ownerUid: "original-owner",
      createdBy: "original-owner",
      updatedBy: "original-owner",
      isExclusive: true,
      exclusiveOwnerUid: "original-owner",
    });

    await assertSucceeds(
      admin.collection("hymns").doc("bootstrap-exclusive-update").update({
        exclusiveOwnerUid: "ADMIN_UID_1",
        updatedBy: "ADMIN_UID_1",
      }),
    );
  });

  it("restricts team document changes to bootstrap admins and dashboard managers", async () => {
    const bootstrap = bootstrapAdminDb();
    await assertSucceeds(
      bootstrap.collection("settings").doc("team").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );
    await assertSucceeds(
      bootstrap.collection("settings").doc("team").update({
        ignoreEnvAdminList: true,
      }),
    );

    const manager = await setTeamMembership({
      uid: "team-manager",
      flags: { canManageDashboard: true },
    });
    const ordinaryMember = await setTeamMembership({
      uid: "ordinary-member",
      flags: { canEdit: true },
    });
    await assertFails(
      ordinaryMember.collection("settings").doc("team").update({
        ignoreEnvAdminList: true,
      }),
    );
    await assertFails(
      ordinaryMember
        .collection("settings")
        .doc("team")
        .update({
          members: {
            "ordinary-member": {
              uid: "ordinary-member",
              canManageDashboard: true,
            },
          },
        }),
    );
    await assertFails(
      ordinaryMember
        .collection("settings")
        .doc("team")
        .update({
          members: {
            "ordinary-member": { uid: "ordinary-member", canEdit: true },
            "promoted-user": { uid: "promoted-user", canManageDashboard: true },
          },
        }),
    );
    await assertFails(
      ordinaryMember.collection("settings").doc("other-settings").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );
    await assertFails(
      manager.collection("settings").doc("other-settings").set({
        members: {},
        ignoreEnvAdminList: false,
      }),
    );
    await assertFails(
      manager.collection("settings").doc("other-settings").get(),
    );
    await assertSucceeds(
      manager.collection("settings").doc("team").update({
        ignoreEnvAdminList: false,
      }),
    );
  });

  it("allows authenticated setlist reads and denies anonymous reads", async () => {
    const signedIn = authedDb("setlist-reader");
    const anon = testEnv.unauthenticatedContext().firestore();
    await seedSetlist("readable", {
      schemaVersion: 1,
      name: "Read test",
      hymnIds: [],
      ownerUid: "setlist-owner",
      createdBy: "setlist-owner",
      updatedBy: "setlist-owner",
    });

    await assertSucceeds(signedIn.collection("setlists").doc("readable").get());
    await assertFails(anon.collection("setlists").doc("readable").get());
  });

  it("enforces setlist ownership, manager, and updater identity rules", async () => {
    const manager = await setTeamMembership({
      uid: "setlist-manager",
      flags: { canManageSetlists: true },
    });
    const owner = authedDb("setlist-owner");
    const stranger = authedDb("setlist-stranger");
    await seedSetlist("manager-target", {
      schemaVersion: 1,
      name: "Manager target",
      hymnIds: [],
      ownerUid: "another-owner",
      createdBy: "another-owner",
      updatedBy: "another-owner",
    });
    await seedSetlist("owner-target", {
      schemaVersion: 1,
      name: "Owner target",
      hymnIds: [],
      ownerUid: "setlist-owner",
      createdBy: "setlist-owner",
      updatedBy: "setlist-owner",
    });
    await seedSetlist("stranger-target", {
      schemaVersion: 1,
      name: "Stranger target",
      hymnIds: [],
      ownerUid: "another-owner",
      createdBy: "another-owner",
      updatedBy: "another-owner",
    });

    await assertSucceeds(
      manager.collection("setlists").doc("manager-target").update({
        name: "Manager updated",
        updatedBy: "setlist-manager",
      }),
    );
    await assertFails(
      manager.collection("setlists").doc("manager-target").update({
        updatedBy: "another-user",
      }),
    );
    await assertSucceeds(
      manager.collection("setlists").doc("manager-target").delete(),
    );

    await assertSucceeds(
      owner.collection("setlists").doc("owner-target").update({
        name: "Owner updated",
        updatedBy: "setlist-owner",
      }),
    );
    await assertSucceeds(
      owner.collection("setlists").doc("owner-target").delete(),
    );
    await assertFails(
      stranger.collection("setlists").doc("stranger-target").update({
        name: "Unauthorized",
        updatedBy: "setlist-stranger",
      }),
    );
    await assertFails(
      stranger.collection("setlists").doc("stranger-target").delete(),
    );
  });

  it.each([
    ["canSaveFirebase", "setlist-save-only", { canSaveFirebase: true }],
    ["canDeleteHymn", "setlist-delete-only", { canDeleteHymn: true }],
    ["canEdit", "setlist-edit-only", { canEdit: true }],
    [
      "canManageDashboard",
      "setlist-dashboard-only",
      { canManageDashboard: true },
    ],
  ])(
    "does not let %s substitute for canManageSetlists",
    async (_flag, uid, flags) => {
      const user = await setTeamMembership({ uid, flags });
      const setlist = {
        schemaVersion: 1,
        name: "Denied role",
        hymnIds: [],
        ownerUid: uid,
        createdBy: uid,
        updatedBy: uid,
      };
      await assertFails(
        user.collection("setlists").doc(`substitute-${uid}`).set(setlist),
      );
    },
  );

  it("does not grant permission for missing, false, invalid, or legacy-array flags", async () => {
    const admin = bootstrapAdminDb();
    await assertSucceeds(
      admin
        .collection("settings")
        .doc("team")
        .set({
          members: {
            "missing-flag": { uid: "missing-flag" },
            "false-flag": { uid: "false-flag", canEdit: false },
            "invalid-flag": { uid: "invalid-flag", canEdit: "true" },
          },
          ignoreEnvAdminList: false,
        }),
    );
    const missing = authedDb("missing-flag");
    const falseFlag = authedDb("false-flag");
    const invalid = authedDb("invalid-flag");

    const createHymn = (uid) => ({
      title: "No write",
      key: "C",
      sections: [],
      ownerUid: uid,
      createdBy: uid,
      updatedBy: uid,
      isExclusive: false,
      exclusiveOwnerUid: "",
    });
    await assertFails(
      missing
        .collection("hymns")
        .doc("missing-flag")
        .set(createHymn("missing-flag")),
    );
    await assertFails(
      falseFlag
        .collection("hymns")
        .doc("false-flag")
        .set(createHymn("false-flag")),
    );
    await assertFails(
      invalid
        .collection("hymns")
        .doc("invalid-flag")
        .set(createHymn("invalid-flag")),
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .collection("settings")
        .doc("team")
        .set({
          members: [{ uid: "legacy-array-user", canEdit: true }],
          ignoreEnvAdminList: false,
        });
    });
    const legacy = authedDb("legacy-array-user");
    await assertFails(
      legacy
        .collection("hymns")
        .doc("legacy-array-write")
        .set(createHymn("legacy-array-user")),
    );
  });
});
