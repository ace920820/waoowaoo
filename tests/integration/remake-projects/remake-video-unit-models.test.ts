import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'

/**
 * Remake video unit persistence contract (D-01 / D-04 / D-17 / D-19 / D-22).
 *
 * Mirrors the schema-contract style of remake-video-task-contract.test.ts:
 * fs.readFileSync assertions pin the unique keys and the forward migration.
 * The DB-backed block runs against the bootstrapped test database whenever
 * BILLING_TEST_BOOTSTRAP=1 (global-setup brings up docker mysql + prisma db
 * push), proving the schema physically pushes with the D-04 constraint.
 */

const schema = readFileSync('prisma/schema.prisma', 'utf8')
const migration = readFileSync(
  'prisma/migrations/20260813120000_add_remake_video_unit/migration.sql',
  'utf8',
)

const BOOTSTRAPPED =
  process.env.BILLING_TEST_BOOTSTRAP === '1' ||
  process.env.SYSTEM_TEST_BOOTSTRAP === '1'

function modelBlock(modelName: string): string {
  const start = schema.indexOf(`model ${modelName}`)
  const end = schema.indexOf('\nmodel ', start + 1)
  return schema.slice(start, end > start ? end : undefined)
}

describe('remake video unit persistence contract', () => {
  it('migration creates the unit/member/track/batch/version/adoption/action-sheet tables', () => {
    expect(migration).toContain('CREATE TABLE `remake_video_units`')
    expect(migration).toContain('CREATE TABLE `remake_video_unit_members`')
    expect(migration).toContain('CREATE TABLE `remake_video_unit_tracks`')
    expect(migration).toContain('CREATE TABLE `remake_video_unit_batches`')
    expect(migration).toContain('CREATE TABLE `remake_video_unit_versions`')
    expect(migration).toContain('CREATE TABLE `remake_video_unit_adoption_events`')
    expect(migration).toContain('CREATE TABLE `remake_video_unit_action_sheets`')
  })

  it('member table enforces unique ordinals within a unit and unique shot ownership (D-04)', () => {
    const memberBlock = modelBlock('RemakeVideoUnitMember')
    expect(memberBlock).toContain('@@unique([unitId, ordinal])')
    expect(memberBlock).toContain('@@unique([shotRevisionId])')
    expect(migration).toContain(
      'UNIQUE INDEX `remake_video_unit_members_unitId_ordinal_key` (`unitId`, `ordinal`)',
    )
    expect(migration).toContain(
      'UNIQUE INDEX `remake_video_unit_members_shotRevisionId_key` (`shotRevisionId`)',
    )
  })

  it('RemakeInvalidation gains nullable unitTrackId/unitBatchId/unitVersionId columns with relations and indexes', () => {
    const block = modelBlock('RemakeInvalidation')
    expect(block).toContain('unitTrackId         String?')
    expect(block).toContain('unitBatchId         String?')
    expect(block).toContain('unitVersionId       String?')
    expect(block).toContain('unitTrack           RemakeVideoUnitTrack?')
    expect(block).toContain('unitBatch           RemakeVideoUnitBatch?')
    expect(block).toContain('unitVersion         RemakeVideoUnitVersion?')
    expect(block).toContain('@@index([unitTrackId])')
    expect(block).toContain('@@index([unitBatchId])')
    expect(block).toContain('@@index([unitVersionId])')
    expect(migration).toContain(
      'ALTER TABLE `remake_invalidations`\n  ADD COLUMN `unitTrackId` VARCHAR(191) NULL,\n  ADD COLUMN `unitBatchId` VARCHAR(191) NULL,\n  ADD COLUMN `unitVersionId` VARCHAR(191) NULL;',
    )
    expect(migration).toContain(
      'CREATE INDEX `remake_invalidations_unitTrackId_idx` ON `remake_invalidations`(`unitTrackId`)',
    )
    expect(migration).toContain(
      'CREATE INDEX `remake_invalidations_unitBatchId_idx` ON `remake_invalidations`(`unitBatchId`)',
    )
    expect(migration).toContain(
      'CREATE INDEX `remake_invalidations_unitVersionId_idx` ON `remake_invalidations`(`unitVersionId`)',
    )
  })

  it('RemakeProvenanceRecord gains nullable unitBatchId', () => {
    const block = modelBlock('RemakeProvenanceRecord')
    expect(block).toContain('unitBatchId     String?')
    expect(block).toContain('unitBatch       RemakeVideoUnitBatch?')
    expect(block).toContain('@@index([unitBatchId])')
    expect(migration).toContain(
      'ALTER TABLE `remake_provenance_records`\n  ADD COLUMN `unitBatchId` VARCHAR(191) NULL;',
    )
    expect(migration).toContain(
      'CREATE INDEX `remake_provenance_records_unitBatchId_idx` ON `remake_provenance_records`(`unitBatchId`)',
    )
  })

  it('existing RemakeVideoTrack @@unique([shotRevisionId]) and prior Remake rows survive (forward-only)', () => {
    expect(schema).toContain('@@unique([shotRevisionId])')
    expect(migration).not.toMatch(/DROP\s+TABLE/i)
    expect(migration).not.toMatch(/DROP\s+COLUMN/i)
    expect(migration).not.toMatch(/TRUNCATE/i)
    expect(migration).not.toMatch(/DELETE\s+FROM/i)
    expect(migration).not.toContain('remake_video_tracks`')
  })

  it('schema pins unit batch trackId_operationKey idempotency key and action-sheet dedup key', () => {
    const unitBatchBlock = modelBlock('RemakeVideoUnitBatch')
    expect(unitBatchBlock).toContain('@@unique([trackId, operationKey])')
    expect(migration).toContain(
      'UNIQUE INDEX `remake_video_unit_batches_trackId_operationKey_key` (`trackId`, `operationKey`)',
    )
    const actionSheetBlock = modelBlock('RemakeVideoUnitActionSheet')
    expect(actionSheetBlock).toContain('@@unique([unitId, fingerprint])')
    expect(migration).toContain(
      'UNIQUE INDEX `remake_video_unit_action_sheets_unitId_fingerprint_key` (`unitId`, `fingerprint`)',
    )
  })
})

describe.skipIf(!BOOTSTRAPPED)('bootstrapped test database', () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('physically created all 7 unit tables in the test database', async () => {
    const expected = [
      'remake_video_units',
      'remake_video_unit_members',
      'remake_video_unit_tracks',
      'remake_video_unit_batches',
      'remake_video_unit_versions',
      'remake_video_unit_adoption_events',
      'remake_video_unit_action_sheets',
    ]
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name AS table_name FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (${expected.map((name) => `'${name}'`).join(',')})`,
    )
    const names = rows.map((row) => row.table_name)
    for (const table of expected) {
      expect(names).toContain(table)
    }
  })

  it('enforces the D-04 unique membership constraint at the DB level', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ constraint_name: string }>>(
      `SELECT constraint_name AS constraint_name FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = 'remake_video_unit_members'
        AND constraint_type = 'UNIQUE'`,
    )
    const constraints = rows.map((row) => row.constraint_name)
    expect(constraints).toContain(
      'remake_video_unit_members_unitId_ordinal_key',
    )
    expect(constraints).toContain('remake_video_unit_members_shotRevisionId_key')
  })
})
