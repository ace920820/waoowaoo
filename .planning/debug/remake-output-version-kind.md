---
title: "Remake output version kind column missing"
status: resolved
date: 2026-08-10
---

## Symptom

Loading a Remake project failed with Prisma error P2022 because
`remake_output_versions.kind` did not exist in the `waoowaoo` development
database.

## Evidence

- `prisma/schema.prisma` models `RemakeOutputVersion.kind`.
- The Phase 8 forward migration adds `kind` and the keyframe persistence
  tables.
- The development database had the pre-Phase 8 Remake tables but no
  `_prisma_migrations` ledger; `prisma migrate status` therefore reported all
  repository migrations as pending.

## Root Cause

The local development database was previously synchronized outside Prisma
migration history and had not received the Phase 8 forward schema changes.

## Resolution

Executed the reviewed Phase 8 migration directly against the configured local
development datasource with `prisma db execute --schema prisma/schema.prisma
--file prisma/migrations/20260810120000_add_remake_keyframe_generation/migration.sql`.

Verified `remake_output_versions.kind`, the Phase 8 relation columns, and all
four `remake_keyframe_*` tables exist afterward.
