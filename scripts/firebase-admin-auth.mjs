import { accessSync, constants, statSync } from "node:fs";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";

const APP_NAME = "local-admin-credential-verification";

export class FirebaseAdminCredentialSetupError extends Error {
  constructor(message) {
    super(message);
    this.name = "FirebaseAdminCredentialSetupError";
  }
}

export function resolveAdminCredentialSource({
  env = process.env,
  stat = statSync,
  access = accessSync,
} = {}) {
  const configuredPath = String(
    env.GOOGLE_APPLICATION_CREDENTIALS || "",
  ).trim();
  if (!configuredPath) {
    return { kind: "application-default" };
  }

  try {
    if (!stat(configuredPath).isFile()) {
      throw new Error("not-a-file");
    }
    access(configuredPath, constants.R_OK);
  } catch {
    throw new FirebaseAdminCredentialSetupError(
      "GOOGLE_APPLICATION_CREDENTIALS must point to a readable credential file.",
    );
  }

  return { kind: "configured-file", path: configuredPath };
}

export async function initializeFirebaseAdminForVerification() {
  const credential = applicationDefault();
  const app =
    getApps().find((candidate) => candidate.name === APP_NAME) ||
    initializeApp({ credential }, APP_NAME);

  const tokenResult = await credential.getAccessToken();
  if (!tokenResult?.access_token) {
    throw new Error("Admin SDK did not return an access token.");
  }

  let projectId = null;
  try {
    projectId = (await credential.getProjectId()) || null;
  } catch {
    projectId = null;
  }

  return { app, projectId };
}

export function getSafeCredentialFailureReason(error, sourceKind) {
  if (error instanceof FirebaseAdminCredentialSetupError) {
    return error.message;
  }

  if (sourceKind === "configured-file") {
    return "The configured credential file could not authenticate with Firebase Admin.";
  }

  return "Application Default Credentials could not be resolved or authenticated.";
}
