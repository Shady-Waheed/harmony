# Firestore Security & Permissions Audit

## Scope

This audit checks the real security boundary of the application as implemented in the repository: React UI permission checks, Firestore rules, and the current server-side data model.

## Firestore paths discovered

- `hymns/{hymnId}`
  - Used by the app to load the hymn list and to save hymn content.
  - Fields currently written by the client include:
    - `title`
    - `key`
    - `sections`
    - `schemaVersion`
    - `isExclusive`
    - `exclusiveOwnerUid`
    - `updatedAt`
    - `createdAt` on create
- `settings/team`
  - Used by the admin dashboard to store team membership and permission flags.
  - Fields include:
    - `members` (array of objects with `email`, `canEdit`, `canSaveFirebase`, `canDeleteHymn`, `canManageDashboard`)
    - `ignoreEnvAdminList`

## Actual roles derived from the code

The real permission model is not a server-side RBAC system. It is a client-side authorization matrix assembled from:

- Firebase Auth user state
- environment variables from `.env.example` and the browser runtime
- team permissions stored in `settings/team`

Observed role categories:

- Guest / unauthenticated user
- Authenticated normal user
- Team member with `canEdit`
- Team member with `canSaveFirebase`
- Team member with `canDeleteHymn`
- Team member with `canManageDashboard`
- Admin via `VITE_ADMIN_*`
- Super admin via `VITE_SUPER_ADMIN_*`

## Current security model

### Client-side permission enforcement

`src/utils/permissions.js` combines environment lists and team membership in the browser to determine whether buttons or screens should be visible.

This is useful for UX, but it is not a security boundary. The browser can be modified or the app can be bypassed entirely.

### Firestore rules boundary

The repository contains `firestore.rules`, which is the effective server-side boundary. For production, that boundary must be the source of truth.

## Audit result for the existing rules

The current rules are better than pure client-only enforcement, but they still have limitations:

- All hymn reads are allowed for any caller: `allow read: if true;`
- The app uses `exclusiveOwnerUid` to protect exclusive hymns in the UI, but the rules do not validate that protection consistently for reads and updates.
- The rule set depends on hardcoded admin email/UID values, which are not configurable by the application itself and are not a substitute for custom claims or server-side membership checks.
- The project has no Firebase emulator config or rules test harness in the repository, so these rules were not actually emulator-verified in this workspace.

## What is safe to infer from the repository

The safest minimal security contract that matches the app’s data model is:

- Unauthenticated users may not write anything.
- Read access to a hymn should be denied when `isExclusive == true` unless the caller is the owner (`exclusiveOwnerUid == request.auth.uid`).
- Create/update/delete actions should be limited to signed-in users who are authorized by the actual server-side membership model.
- Team settings should only be writable by users who are explicitly authorized to manage dashboard permissions.
- Fields like `exclusiveOwnerUid` must not be re-assigned to another user by a normal editor.

## Client-side permission weaknesses discovered

- `VITE_*` variables are browser-visible environment values and cannot be treated as a secret security mechanism.
- `permissionsCache.js` caches roles in localStorage as a UX optimization. That cache must never be treated as an authorization boundary.
- `resolvePermissions` is only used to hide or show UI, not to enforce access inside Firestore.
- A malicious client can still send direct Firestore requests if the server rules are not restrictive enough.

## Recommended minimal production model

The safest minimal upgrade for this app is to move from browser env lists to a real server-side membership source, ideally through Firebase custom claims or a trusted backend function that populates a user’s role data.

That would allow rules to evaluate:

- `request.auth.uid`
- custom claims like `admin`, `teamEditor`, `teamSaver`, `teamDeleter`
- membership checks against a secure server-held team document

This is outside the current app architecture, so this repo intentionally does not replace the app with a new backend-layer pattern during this phase.

## Rules status in this repo

The repository now contains a hardened rules file that enforces:

- signed-in-only writes
- exclusive hymn ownership checks
- team membership-based admin/dashboard checks
- delete permission separation from update permission
- team settings protection

This is a safer baseline, but it remains a best-effort rules hardening within the current architecture and was not enabled with emulator tests in this workspace.

## Secret scan status

No private Firebase service account JSON, private key, or password was found in the repository.

The Firebase web config present in `src/firebase.js` is public client config and is not treated as a secret in this audit.

## Shared Setlist model (Phase 6)

The shared setlist data model is stored in `setlists/{setlistId}`.

Canonical record shape:

```js
{
  schemaVersion: 1,
  id: "setlist-id",
  name: "Sunday Service",
  hymnIds: ["hymn-1", "hymn-2", "hymn-3"],
  ownerUid: "uid",
  createdBy: "uid",
  updatedBy: "uid",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z"
}
```

### Access model

- Read: any signed-in user can read a shared setlist document.
- Create: signed-in user with the existing hymn save/edit capability (`canModifyHymns`) can create a setlist, and the document must be owned by their authenticated UID.
- Edit / reorder: owner or authorized member can update the setlist, but the owner UID and `createdBy` fields are protected and cannot be reassigned.
- Delete: owner or a user with delete capability may remove the setlist.
- Exclusive hymns are not bypassed by setlists. The setlist stores hymn IDs only; a user still needs permission to the underlying hymn record, and the app checks exclusive access before opening that hymn.
- The local setlist remains available as a device-local fallback cache. It is not a server-side security boundary.
- Conflict handling remains intentionally simple: the app updates the setlist document and keeps local unsaved state in the normal save-state model, but it does not claim full multi-user conflict resolution.

## Verification status

The app’s JavaScript tests were run and passed, but no Firestore emulator or Firebase rules harness exists in the repository, so the rules were not emulator-tested here.
