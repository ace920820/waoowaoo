---
phase: 06-scenedetect
plan: 06
status: complete
---

# Phase 06-06 Summary

Implemented append-only native SceneDetect Shot mutations and optimistic concurrency.

- Added `commitNativeProjectMutation` with stable Waoo shot identity, server-assigned IDs for new split shots, explicit current revision/version checks, immutable revision history with retirement markers, delete retirement, no-op detection, and output invalidation/needs-review propagation.
- Added opaque project concurrency tokens to the native project GET response and an authenticated PUT requiring `If-Match`; stale writes return 409 with the current canonical project/token.
- Updated the embedded runtime client to retain the token, use native PUT saves, serialize saves as single-flight latest-pending requests, and expose conflict details without retry loops.
- Added focused mutation coverage for no-op, append-only revision/invalidation, and stale-token atomic rejection.

Verification:

- `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-scenedetect-mutations.test.ts tests/contracts/remake-scenedetect-native-contract.test.ts tests/integration/api/remake-projects-scenedetect-runtime.test.ts` (8 tests passed)
- `npx tsc --noEmit --pretty false` passed
- `node scripts/vendor-scenedetect.mjs --check` passed (`files=19 patches=1`)

Known environment limitation: full `verify:commit` remains blocked by the existing billing integration dependency on a running Colima/Docker socket.
