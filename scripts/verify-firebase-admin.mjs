#!/usr/bin/env node

import {
  getSafeCredentialFailureReason,
  initializeFirebaseAdminForVerification,
  resolveAdminCredentialSource,
} from "./firebase-admin-auth.mjs";

async function main() {
  let source;
  try {
    source = resolveAdminCredentialSource();
    const { projectId } = await initializeFirebaseAdminForVerification();
    console.log("Firebase Admin credentials: AVAILABLE");
    console.log("Firebase Admin authentication: OK");
    console.log(`Firebase project: ${projectId || "UNAVAILABLE"}`);
    console.log("Firestore access check: NOT PERFORMED");
    console.log("Data mutation: NOT PERFORMED");
    return 0;
  } catch (error) {
    console.log("Firebase Admin credentials: UNAVAILABLE");
    console.log(
      `Reason: ${getSafeCredentialFailureReason(error, source?.kind)}`,
    );
    console.log("No Firestore access performed.");
    console.log("No data modified.");
    return 1;
  }
}

process.exitCode = await main();
