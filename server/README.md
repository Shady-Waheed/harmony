# Trusted Team UID Resolution Design

This repository does not currently include a deployable Firebase backend. The browser client is intentionally read-only for user auth and Firestore access, and the Admin SDK must not be exposed to the frontend.

## Target pattern

The intended architecture is:

```text
React Admin Dashboard
  -> trusted server-side endpoint
  -> Firebase Admin SDK
  -> Firebase Authentication lookup by email
  -> return safe metadata only
  -> React Admin Dashboard
```

This process is strictly read-only and must never mutate the Firebase Auth user, Firestore, or team config.

## Security rules

- keep Firebase Admin SDK and service-account credentials outside the browser bundle
- never use `VITE_*` variables for admin credentials
- never trust client-supplied UID values as identity
- never trust client-supplied `isAdmin` or `canManageDashboard` flags
- authenticate the caller using the Firebase ID token on the trusted backend
- authorize only after verifying a real server-side identity and team-manager policy

## Future team model

The target model is UID-based, using a map keyed by Firebase Auth UID:

```json
{
  "members": {
    "uid-123": {
      "email": "member@example.com",
      "canEdit": true,
      "canSaveFirebase": true,
      "canDeleteHymn": false,
      "canManageDashboard": false
    }
  },
  "ignoreEnvAdminList": false
}
```

This remains future work and is not activated automatically.

## Current status

The project currently contains the standalone audit utility in [scripts/firebase-uid-audit.mjs](../scripts/firebase-uid-audit.mjs), which remains useful as optional diagnostic tooling. The server-side trusted resolver is implemented as a pure backend module in [firebaseTeamResolver.mjs](./firebaseTeamResolver.mjs) and is tested without connecting to live Firebase.
