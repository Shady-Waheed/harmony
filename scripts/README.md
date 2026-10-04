# Firebase UID Audit Tool

This folder contains a standalone, read-only Firebase Authentication audit utility that is intentionally kept outside the React/Vite app.

## Setup

Install the project dependencies:

```bash
npm install
```

## Credentials

The audit tool uses the Firebase Admin SDK with Application Default Credentials or a service account file exposed through the local environment variable:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
```

This credential source must remain local to the operator's machine and must never be committed to the repository.

## Input

The real local file should be created manually and is intentionally not tracked:

```bash
scripts/team-emails.txt
```

A template file is provided:

```bash
scripts/team-emails.example.txt
```

Each line should contain one team email. Lines beginning with `#` are ignored.

## Run

```bash
node scripts/firebase-uid-audit.mjs --team-file scripts/team-emails.txt
```

JSON output:

```bash
node scripts/firebase-uid-audit.mjs --team-file scripts/team-emails.txt --json
```

Write to a file:

```bash
node scripts/firebase-uid-audit.mjs --team-file scripts/team-emails.txt --output audit-output/report.txt
```

## Safety

This tool is intentionally read-only:

- no Firestore writes
- no Firestore Rule changes
- no Firebase Auth mutations
- no team-document updates
- no migration logic
- no automatic UID persistence

## Exit codes

- `0`: all team emails resolved uniquely
- `1`: runtime or credential failure
- `2`: unresolved or ambiguous team email mappings remain

## Notes

The tool must be run only by an authorized local operator against a trusted Firebase project. It must never be executed automatically as part of the frontend application or build pipeline.

## Verify Firebase Admin credentials

Production audit scripts require trusted Firebase Admin credentials. Keep credentials local and outside frontend configuration. Never put Admin credentials in `src/`, `VITE_*`, frontend environment variables, Git, or chat messages.

The preferred local convention is `.local-secrets/`, which is excluded by `.gitignore`. A credential file can also be stored outside the repository. Do not commit or share it.

Set up credentials locally, then verify authentication without reading Firestore:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
npm run verify:firebase-admin
```

The verification command initializes Firebase Admin, obtains an authentication credential, and prints the project ID when available. It does not initialize Firestore, read documents, or modify data. It never prints credential contents or access tokens. Application Default Credentials are used when `GOOGLE_APPLICATION_CREDENTIALS` is not set.

## Read-only hymn schema inventory

After `npm run verify:firebase-admin` succeeds for the expected project, run:

```bash
npm run audit:hymn-schema
```

This command requires the `harmony-notes` project identity and reads only projected metadata fields from `hymns`. It writes summary reports to the Git-ignored `audit-output/` directory. It does not read hymn sections, lyrics, or chords and does not write to Firebase.
