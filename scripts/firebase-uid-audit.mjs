#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import admin from "firebase-admin";
import {
  createSummary,
  formatAuditReport,
  readTeamEmailsFromFile,
  reconcileTeamMembership,
  resolveExitCode,
} from "./firebase-uid-audit-core.mjs";

function printUsage() {
  const usage = `Usage: node scripts/firebase-uid-audit.mjs --team-file <path> [--json] [--output <path>] [--help]

Options:
  --team-file <path>  Path to the local team email list.
  --json             Emit JSON instead of the human-readable report.
  --output <path>    Write the report to a file instead of stdout.
  --help             Show this help text.

Notes:
  - This tool is read-only and must not mutate Firebase Auth or Firestore.
  - It requires a secure local Admin SDK credential source via GOOGLE_APPLICATION_CREDENTIALS.
`;
  console.log(usage);
}

function parseArgs(argv) {
  const options = {
    teamFile: null,
    json: false,
    output: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "--team-file":
        options.teamFile = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--json":
        options.json = true;
        break;
      case "--output":
        options.output = argv[index + 1] ?? null;
        index += 1;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        if (token.startsWith("--")) {
          throw new Error(`Unknown option: ${token}`);
        }
        break;
    }
  }

  return options;
}

async function listAllAuthUsers() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const auth = admin.auth();
  const allUsers = [];
  let pageToken = undefined;

  do {
    const page = await auth.listUsers(1000, pageToken);
    allUsers.push(...(page.users ?? []));
    pageToken = page.pageToken;
  } while (pageToken);

  return allUsers;
}

function buildJsonReport(report) {
  const summary = createSummary(report);
  return {
    matched: report.matched,
    unmatchedTeamEmails: report.unmatchedTeamEmails,
    ambiguous: report.ambiguous,
    authUsersNotInTeam: report.authUsersNotInTeam,
    authUsersWithoutEmail: report.authUsersWithoutEmail,
    summary: {
      authUsersScanned: summary.authUsersScanned,
      matched: summary.matched,
      unmatched: summary.unmatched,
      ambiguous: summary.ambiguous,
      authUsersNotInTeam: summary.authUsersNotInTeam,
      usersWithoutEmail: summary.usersWithoutEmail,
    },
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      printUsage();
      return 0;
    }

    if (!options.teamFile) {
      printUsage();
      console.error("ERROR: --team-file is required.");
      return 1;
    }

    const teamFilePath = resolve(options.teamFile);
    if (!existsSync(teamFilePath)) {
      console.error(`ERROR: team file does not exist: ${teamFilePath}`);
      return 1;
    }

    const teamEmails = readTeamEmailsFromFile(teamFilePath);
    const authUsers = await listAllAuthUsers();
    const report = reconcileTeamMembership(teamEmails, authUsers);
    const summary = createSummary({
      ...report,
      summary: {
        authUsersScanned: authUsers.length,
      },
    });

    const fullReport = {
      ...report,
      summary,
    };

    const outputText = options.json
      ? `${JSON.stringify(buildJsonReport(fullReport), null, 2)}\n`
      : `${formatAuditReport(fullReport)}\n`;

    if (options.output) {
      const outputPath = resolve(options.output);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, outputText, "utf8");
    } else {
      process.stdout.write(outputText);
    }

    return resolveExitCode(fullReport);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("ERROR: Firebase UID audit failed.");
    console.error(message);
    console.error(
      "Set GOOGLE_APPLICATION_CREDENTIALS to a trusted local Admin SDK credential source before running this tool.",
    );
    return 1;
  }
}

const exitCode = await main();
process.exitCode = exitCode;
