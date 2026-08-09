import { prisma } from '@/lib/prisma'
import { supersedeLegacyImagePromptSchemaFailures, type TaskRepairClient } from '@/lib/remake-projects/prompt/supersede-legacy-schema-failures'

const apply = process.argv.includes('--apply')

async function main() {
  const result = await supersedeLegacyImagePromptSchemaFailures(prisma as unknown as TaskRepairClient, { apply })
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
