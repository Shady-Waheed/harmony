#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initializeFirebaseAdminForVerification } from "./firebase-admin-auth.mjs";
import {
  buildHymnSchemaInventory,
  formatHymnSchemaInventory,
} from "./hymn-schema-inventory-core.mjs";

const EXPECTED_PROJECT_ID = "harmony-notes";
const OUTPUT_JSON = fileURLToPath(
  new URL("../audit-output/hymns-schema-inventory.json", import.meta.url),
);
const OUTPUT_TEXT = fileURLToPath(
  new URL("../audit-output/hymns-schema-inventory.txt", import.meta.url),
);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

async function main() {
  try {
    const { app, projectId } = await initializeFirebaseAdminForVerification();
    if (projectId !== EXPECTED_PROJECT_ID) {
      throw new Error(
        "Credential project does not match the expected inventory project.",
      );
    }

    const snapshot = await getFirestore(app)
      .collection("hymns")
      .select(
        "title",
        "key",
        "isExclusive",
        "exclusiveOwnerUid",
        "createdAt",
        "schemaVersion",
      )
      .get();
    const documents = snapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    }));
    const inventory = buildHymnSchemaInventory(documents, {
      isTimestamp: (value) => value instanceof Timestamp,
    });
    const textReport = formatHymnSchemaInventory(inventory);

    await mkdir(dirname(OUTPUT_JSON), { recursive: true });
    await Promise.all([
      writeFile(OUTPUT_JSON, `${JSON.stringify(inventory, null, 2)}\n`, "utf8"),
      writeFile(OUTPUT_TEXT, textReport, "utf8"),
    ]);

    process.stdout.write(textReport);
    console.log(`JSON report: ${resolve(OUTPUT_JSON)}`);
    console.log(`Text report: ${resolve(OUTPUT_TEXT)}`);
    return 0;
  } catch (error) {
    const reason =
      error?.code === "permission-denied"
        ? "Firebase denied read access to the hymns collection."
        : error?.code === "unavailable"
          ? "Firebase is unavailable; no complete inventory was generated."
          : error?.message ===
              "Credential project does not match the expected inventory project."
            ? error.message
            : "The read-only hymn schema inventory failed. Check trusted Admin credentials and connectivity.";
    console.error(`Hymn schema inventory: FAILED. ${reason}`);
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(SCRIPT_DIR, "hymn-schema-inventory.mjs")
) {
  process.exitCode = await main();
}
