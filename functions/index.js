import admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  isServerAuthorizedTeamManager,
  normalizeEmailForComparison,
  parseBootstrapAdminUids,
} from "../server/firebaseTeamResolver.mjs";

if (!admin.apps.length) {
  admin.initializeApp();
}

async function getAuthorizedTeamManagerState(context) {
  const uid = context?.auth?.uid;
  if (typeof uid !== "string" || uid.trim().length === 0) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const bootstrapAdminUids = parseBootstrapAdminUids(
    globalThis.process?.env?.ADMIN_UIDS,
  );
  const firestore = admin.firestore();
  const teamDocSnap = await firestore.doc("settings/team").get();
  const teamData = teamDocSnap.exists
    ? teamDocSnap.data() || { members: {} }
    : { members: {} };

  if (
    isServerAuthorizedTeamManager({
      requestUser: { uid },
      teamData,
      bootstrapAdminUids,
    })
  ) {
    return { uid, teamData };
  }

  throw new HttpsError(
    "permission-denied",
    "The caller is not authorized to manage team membership.",
  );
}

export const resolveTeamMemberByEmail = onCall(async (request) => {
  if (
    typeof request?.auth?.uid !== "string" ||
    request.auth.uid.trim().length === 0
  ) {
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
