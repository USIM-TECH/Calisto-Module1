/**
 * One-off data copy: PostgreSQL → MySQL via Prisma (MySQL) + pg (Postgres).
 * Run via ./scripts/migrate-postgres-to-mysql.sh
 */
import pg from 'pg'
import { PrismaClient } from '@prisma/client'

const postgresUrl = process.env.POSTGRES_DATABASE_URL
const mysqlUrl = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL

if (!postgresUrl || !mysqlUrl) {
  console.error('POSTGRES_DATABASE_URL and LOCAL_DATABASE_URL (or DATABASE_URL) are required.')
  process.exit(1)
}

async function assertPostgresReachable(pool: pg.Pool): Promise<void> {
  try {
    await pool.query('SELECT 1')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      'Cannot connect to PostgreSQL at',
      postgresUrl,
      '\n',
      message,
      '\n\nStart the old database first, e.g.:',
      '\n  docker compose -f docker-compose.postgres-import.yml up -d',
      '\n  ./scripts/setup-local-mysql.sh --import-postgres',
    )
    process.exit(1)
  }
}

const pool = new pg.Pool({ connectionString: postgresUrl })
const mysql = new PrismaClient({ datasources: { db: { url: mysqlUrl } } })

async function readRows<T extends pg.QueryResultRow>(sql: string): Promise<T[]> {
  const result = await pool.query<T>(sql)
  return result.rows
}

async function copyTable<T extends Record<string, unknown>>(
  label: string,
  sql: string,
  write: (rows: T[]) => Promise<unknown>,
): Promise<void> {
  const rows = await readRows<T>(sql)
  if (rows.length === 0) {
    console.log(`${label}: 0 rows (skipped)`)
    return
  }
  await write(rows)
  console.log(`${label}: ${rows.length} rows`)
}

try {
  await assertPostgresReachable(pool)
  await mysql.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')

  for (const table of [
    'KnowledgeChunk',
    'KnowledgeDocument',
    'Product',
    'ConversationMessage',
    'Conversation',
    'WebhookEvent',
    'Interest',
    'CurrentInterest',
    'SupportCase',
    'ChannelIdentity',
    'Customer',
    'DedupeKey',
  ]) {
    await mysql.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``)
  }

  await copyTable('Customer', 'SELECT * FROM "Customer"', (rows) =>
    mysql.customer.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('ChannelIdentity', 'SELECT * FROM "ChannelIdentity"', (rows) =>
    mysql.channelIdentity.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('Interest', 'SELECT * FROM "Interest"', (rows) =>
    mysql.interest.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('CurrentInterest', 'SELECT * FROM "CurrentInterest"', (rows) =>
    mysql.currentInterest.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('SupportCase', 'SELECT * FROM "SupportCase"', (rows) =>
    mysql.supportCase.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('Conversation', 'SELECT * FROM "Conversation"', (rows) =>
    mysql.conversation.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('ConversationMessage', 'SELECT * FROM "ConversationMessage"', (rows) =>
    mysql.conversationMessage.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('WebhookEvent', 'SELECT * FROM "WebhookEvent"', (rows) =>
    mysql.webhookEvent.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('DedupeKey', 'SELECT * FROM "DedupeKey"', (rows) =>
    mysql.dedupeKey.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('Product', 'SELECT * FROM "Product"', (rows) =>
    mysql.product.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('KnowledgeDocument', 'SELECT * FROM "KnowledgeDocument"', (rows) =>
    mysql.knowledgeDocument.createMany({ data: rows as never[], skipDuplicates: true }),
  )
  await copyTable('KnowledgeChunk', 'SELECT * FROM "KnowledgeChunk"', (rows) =>
    mysql.knowledgeChunk.createMany({ data: rows as never[], skipDuplicates: true }),
  )

  await mysql.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
} finally {
  await pool.end()
  await mysql.$disconnect()
}
