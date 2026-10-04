import admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { normalizeEmailForComparison } from "../server/firebaseTeamResolver.mjs";

if (!admin.apps.length) {
  admin.initializeApp();
}

function normalizeServerAdminList(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((value) => normalizeEmailForComparison(value))
    .filter(Boolean);
}

async function getAuthorizedTeamManagerState(context) {
  if (!context?.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const uid = String(context.auth.uid);
  const firestore = admin.firestore();
  const teamDocSnap = await firestore.doc("settings/team").get();
  const teamData = teamDocSnap.exists
    ? teamDocSnap.data() || { members: {} }
    : { members: {} };
  const memberMap =
    teamData.members &&
    typeof teamData.members === "object" &&
    !Array.isArray(teamData.members)
      ? teamData.members
      : {};

  const memberRow = memberMap[uid] || null;
  if (memberRow && Boolean(memberRow.canManageDashboard)) {
    return { uid, teamData };
  }

  const serverAdminUids = String(globalThis.process?.env?.ADMIN_UIDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (serverAdminUids.includes(uid)) {
    return { uid, teamData };
  }

  const user = await admin.auth().getUser(uid);
  const candidateEmails = [
    user.email,
    ...(user.providerData || []).map((provider) => provider?.email),
  ]
    .map((value) => normalizeEmailForComparison(value))
    .filter(Boolean);

  const serverAdminEmails = normalizeServerAdminList(
    globalThis.process?.env?.ADMIN_EMAILS || "",
  );

  if (candidateEmails.some((email) => serverAdminEmails.includes(email))) {
    return { uid, teamData };
  }

  throw new HttpsError(
    "permission-denied",
    "The caller is not authorized to manage team membership.",
  );
}

export const resolveTeamMemberByEmail = onCall(async (request) => {
  if (!request?.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const rawEmail =
    typeof request.data?.email === "string" ? request.data.email : "";
  const normalizedEmail = normalizeEmailForComparison(rawEmail);

  if (!normalizedEmail) {
    throw new HttpsError(
      "invalid-argument",
      "A valid team member email is required.",
    );
  }

  await getAuthorizedTeamManagerState(request);

  try {
    const authUser = await admin.auth().getUserByEmail(normalizedEmail);
    return {
      status: "MATCHED",
      user: {
        uid: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName || "",
        emailVerified: Boolean(authUser.emailVerified),
        disabled: Boolean(authUser.disabled),
        providerIds: Array.isArray(authUser.providerData)
          ? authUser.providerData.map((item) => item.providerId)
          : [],
      },
      normalizedEmail,
    };
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      return {
        status: "UNMATCHED",
        normalizedEmail,
        reason: "NO_ACCOUNT_FOR_EMAIL",
      };
    }

    throw new HttpsError(
      "internal",
      "Unable to resolve the requested team member email.",
    );
  }
});

export const resolveTeamMemberPreview = resolveTeamMemberByEmail;
