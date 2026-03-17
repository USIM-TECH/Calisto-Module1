import crypto from 'crypto'
import type { IncomingMessage, OutgoingMessage } from '../core/types.js'
import type { NLPClient, Logger } from '../core/utils/index.js'
import type { HubSpotClient } from '../integrations/crm/hubspot/index.js'
import type { MessageDeduplicator } from './message-deduplicator.js'
import { mapNlpResponseToOutgoingMessages } from './rasa-outgoing.js'
import type { LeadRecord } from './records.js'
import { RuntimeStore } from './runtime-store.js'

interface LeadOrchestratorOptions {
  logger: Logger
  nlpClient: NLPClient
  deduplicator: MessageDeduplicator
  runtimeStore: RuntimeStore
  hubspot?: HubSpotClient
}

export interface OrchestratedReply {
  lead: LeadRecord
  outgoingMessages: OutgoingMessage[]
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed || undefined
}

function deriveLeadSnapshot(tracker: { latestIntent?: string; slots: Record<string, unknown> } | undefined) {
  const slots = tracker?.slots ?? {}
  const leadName = normalizeText(slots.lead_name ?? slots.customer_name ?? slots.name)
  const email = normalizeText(slots.email)
  const phone = normalizeText(slots.contact_number ?? slots.phone_number ?? slots.phone)
  const preferredService = normalizeText(
    slots.preferred_service ?? slots.product_type ?? slots.lens_type ?? slots.service_type
  )
  const location = normalizeText(slots.lead_location ?? slots.city ?? slots.location)
  const rawStatus = normalizeText(slots.lead_status)

  const qualificationStatus: LeadRecord['qualificationStatus'] = rawStatus === 'qualified'
    ? 'qualified'
    : rawStatus === 'unqualified'
      ? 'unqualified'
      : leadName || email || phone || preferredService || location
        ? 'needs_review'
        : 'new'

  return {
    leadName,
    email,
    phone,
    preferredService,
    location,
    qualificationStatus,
    lastIntent: tracker?.latestIntent,
  }
}

function deriveChannelPhone(message: IncomingMessage): string | undefined {
  const sourceId = message.sourceId ?? message.senderId
  if (message.channel === 'whatsapp') {
    const normalized = String(sourceId).replace(/[^\d+]/g, '')
    return normalized || undefined
  }
  return undefined
}

function nextOutboundMessageId(): string {
  return `out_${crypto.randomUUID()}`
}

export class LeadOrchestrator {
  private readonly _logger: Logger
  private readonly _nlpClient: NLPClient
  private readonly _deduplicator: MessageDeduplicator
  private readonly _runtimeStore: RuntimeStore
  private readonly _hubspot?: HubSpotClient

  constructor(options: LeadOrchestratorOptions) {
    this._logger = options.logger
    this._nlpClient = options.nlpClient
    this._deduplicator = options.deduplicator
    this._runtimeStore = options.runtimeStore
    this._hubspot = options.hubspot
  }

  public async process(message: IncomingMessage): Promise<OrchestratedReply | undefined> {
    if (!this._deduplicator.shouldProcess(message)) {
      this._logger.warn(`[${message.channel}] Ignoring duplicate message ${message.messageId}`)
      return undefined
    }

    const sourceId = message.sourceId ?? message.senderId
    const lead = this._runtimeStore.getOrCreateLead({ ...message, sourceId })
    const messageText = message.type === 'interactive'
      ? (message.interactive?.id || message.interactive?.title || message.text)
      : (message.text || message.interactive?.title)

    this._runtimeStore.appendConversationMessage(
      lead.id,
      {
        direction: 'inbound',
        messageId: message.messageId,
        text: messageText,
        messageType: message.type,
        timestamp: message.timestamp,
        metadata: {
          channel: message.channel,
          sourceId,
          conversationId: message.conversationId,
          leadId: lead.id,
        },
      },
      message.channel,
      sourceId,
      message.conversationId,
    )

    this._runtimeStore.appendWebhookEvent({
      channel: message.channel,
      direction: 'inbound',
      path: `/messages/${message.channel}`,
      sourceId,
      conversationId: message.conversationId,
      leadId: lead.id,
      payload: message.rawPayload,
    })

    if (!messageText) {
      this._logger.warn(`[${message.channel}] Ignoring non-text message for lead ${lead.id}`)
      return {
        lead,
        outgoingMessages: [],
      }
    }

    const nlpResponse = await this._nlpClient.getResponse(message.senderId, messageText)
    const trackerSnapshot = deriveLeadSnapshot(nlpResponse.tracker)
    if (!trackerSnapshot.phone) {
      trackerSnapshot.phone = deriveChannelPhone(message)
    }
    const updatedLead = this._runtimeStore.updateLead(lead.id, trackerSnapshot) ?? lead
    const outgoingMessages = mapNlpResponseToOutgoingMessages(nlpResponse)

    for (const outgoingMessage of outgoingMessages) {
      this._runtimeStore.appendConversationMessage(
        updatedLead.id,
        {
          direction: 'outbound',
          messageId: nextOutboundMessageId(),
          text: outgoingMessage.type === 'text' ? outgoingMessage.text : ('text' in outgoingMessage ? outgoingMessage.text : undefined),
          messageType: outgoingMessage.type,
          timestamp: new Date().toISOString(),
          metadata: {
            channel: message.channel,
            sourceId,
            conversationId: message.conversationId,
            leadId: updatedLead.id,
          },
        },
        message.channel,
        sourceId,
        message.conversationId,
      )
    }

    this._runtimeStore.appendWebhookEvent({
      channel: message.channel,
      direction: 'outbound',
      path: `/messages/${message.channel}`,
      sourceId,
      conversationId: message.conversationId,
      leadId: updatedLead.id,
      payload: {
        metadata: {
          channel: message.channel,
          sourceId,
          leadId: updatedLead.id,
          conversationId: message.conversationId,
        },
        messages: outgoingMessages,
      },
    })

    await this._syncQualifiedLead(updatedLead)

    return { lead: updatedLead, outgoingMessages }
  }

  public getSummary() {
    return this._runtimeStore.getSummary()
  }

  public listLeads() {
    return this._runtimeStore.listLeads()
  }

  public listConversations() {
    return this._runtimeStore.listConversations()
  }

  private async _syncQualifiedLead(lead: LeadRecord): Promise<void> {
    if (!this._hubspot || lead.qualificationStatus !== 'qualified') {
      return
    }

    try {
      const existing = await this._hubspot.searchContact({
        email: lead.email,
        phone: lead.phone,
      }).catch(() => undefined)

      const contactProperties = {
        firstname: lead.leadName ?? lead.senderName ?? 'Unknown',
        phone: lead.phone ?? '',
        city: lead.location ?? '',
        lifecyclestage: 'lead',
        hs_lead_status: lead.qualificationStatus,
        favorite_product: lead.preferredService ?? '',
        channel_source: lead.channel,
        source_id: lead.sourceId,
        lead_id: lead.id,
        conversation_id: lead.conversationId,
      }

      const contact = existing
        ? await this._hubspot.updateContact({
            contactId: existing.id,
            email: lead.email,
            phone: lead.phone,
            additionalProperties: contactProperties,
          })
        : await this._hubspot.createContact({
            email: lead.email,
            phone: lead.phone,
            additionalProperties: contactProperties,
          })

      const leadName = lead.preferredService
        ? `${lead.preferredService} lead`
        : `Lead from ${lead.channel}`

      const hubspotLead = await this._hubspot.createLead({
        leadName,
        additionalProperties: {
          hs_pipeline_stage: 'qualified',
          source_channel: lead.channel,
          source_id: lead.sourceId,
          linked_contact_id: String(contact.id),
          qualification_status: lead.qualificationStatus,
        },
      })

      this._runtimeStore.updateLead(lead.id, {
        crmStatus: 'synced',
        crmRecordId: String(hubspotLead.id ?? contact.id),
      })
    } catch (error: any) {
      this._logger.error(`[CRM] Failed to sync qualified lead ${lead.id}: ${error.message}`)
      this._runtimeStore.updateLead(lead.id, { crmStatus: 'failed' })
    }
  }
}
