/**
 * One-off import of legacy file store into PostgreSQL.
 * Use on an empty database (or expect unique-key conflicts on re-run).
 *
 * Usage: DATABASE_URL=... npm run db:import-json [path/to/runtime-store.json]
 */
import * as dotenv from 'dotenv'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ChatChannel,
  CrmStatus,
  MessageDirection,
  Prisma,
  PrismaClient,
  QualificationStatus,
  ResponseStyle,
  WebhookDirection,
} from '@prisma/client'
import type { RuntimeDataShape } from '../src/leads/types/records.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

function parseJsonPath(): string {
  const arg = process.argv[2]
  if (arg) {
    return path.resolve(process.cwd(), arg)
  }
  return path.resolve(__dirname, '..', 'data', 'runtime', 'runtime-store.json')
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('Set DATABASE_URL in .env (or the environment) to import into PostgreSQL.')
    process.exit(1)
  }

  const jsonPath = parseJsonPath()
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as RuntimeDataShape
  const prisma = new PrismaClient()

  try {
    await prisma.$transaction(async (tx) => {
      for (const lead of raw.leads) {
        await tx.lead.upsert({
          where: { id: lead.id },
          create: {
            id: lead.id,
            channel: lead.channel as ChatChannel,
            sourceId: lead.sourceId,
            conversationId: lead.conversationId,
            responseStyle: lead.responseStyle ? (lead.responseStyle as ResponseStyle) : null,
            senderName: lead.senderName ?? null,
            leadName: lead.leadName ?? null,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
            preferredService: lead.preferredService ?? null,
            location: lead.location ?? null,
            qualificationStatus: lead.qualificationStatus as QualificationStatus,
            crmStatus: lead.crmStatus as CrmStatus,
            crmRecordId: lead.crmRecordId ?? null,
            lastIntent: lead.lastIntent ?? null,
            lastMessageAt: new Date(lead.lastMessageAt),
            createdAt: new Date(lead.createdAt),
            updatedAt: new Date(lead.updatedAt),
          },
          update: {
            conversationId: lead.conversationId,
            responseStyle: lead.responseStyle ? (lead.responseStyle as ResponseStyle) : null,
            senderName: lead.senderName ?? null,
            leadName: lead.leadName ?? null,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
            preferredService: lead.preferredService ?? null,
            location: lead.location ?? null,
            qualificationStatus: lead.qualificationStatus as QualificationStatus,
            crmStatus: lead.crmStatus as CrmStatus,
            crmRecordId: lead.crmRecordId ?? null,
            lastIntent: lead.lastIntent ?? null,
            lastMessageAt: new Date(lead.lastMessageAt),
            updatedAt: new Date(lead.updatedAt),
          },
        })
      }

      for (const conv of raw.conversations) {
        await tx.conversation.upsert({
          where: { id: conv.id },
          create: {
            id: conv.id,
            leadId: conv.leadId,
            channel: conv.channel as ChatChannel,
            sourceId: conv.sourceId,
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt),
          },
          update: {
            updatedAt: new Date(conv.updatedAt),
          },
        })

        await tx.conversationMessage.deleteMany({ where: { conversationId: conv.id } })
        if (conv.messages.length > 0) {
          await tx.conversationMessage.createMany({
            data: conv.messages.map((m) => ({
              conversationId: conv.id,
              direction: m.direction === 'inbound'
                ? MessageDirection.inbound
                : MessageDirection.outbound,
              messageId: m.messageId,
              text: m.text ?? null,
              messageType: m.messageType,
              timestamp: new Date(m.timestamp),
              metadata: m.metadata as Prisma.InputJsonValue,
            })),
          })
        }
      }

      for (const evt of raw.webhookEvents) {
        await tx.webhookEvent.upsert({
          where: { id: evt.id },
          create: {
            id: evt.id,
            channel: evt.channel as ChatChannel,
            direction: evt.direction === 'inbound'
              ? WebhookDirection.inbound
              : WebhookDirection.outbound,
            path: evt.path,
            sourceId: evt.sourceId,
            conversationId: evt.conversationId,
            leadId: evt.leadId ?? null,
            receivedAt: new Date(evt.receivedAt),
            payload: evt.payload as Prisma.InputJsonValue,
          },
          update: {
            payload: evt.payload as Prisma.InputJsonValue,
            receivedAt: new Date(evt.receivedAt),
          },
        })
      }

      for (const d of raw.deduplication) {
        await tx.dedupeKey.upsert({
          where: { key: d.key },
          create: {
            key: d.key,
            seenAt: new Date(d.seenAt),
          },
          update: {
            seenAt: new Date(d.seenAt),
          },
        })
      }
    })

    console.log(`Imported from ${jsonPath}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
