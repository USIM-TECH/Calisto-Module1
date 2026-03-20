import crypto from 'crypto'
import type { IncomingMessage, OutgoingMessage } from '../../core/types.js'
import type { NLPClient, Logger } from '../../core/utils/index.js'
import type { HubSpotClient } from '../../integrations/crm/hubspot/index.js'
import type { MessageDeduplicator } from './message-deduplicator.js'
import { mapNlpResponseToOutgoingMessages } from './rasa-outgoing.js'
import type { LeadRecord } from '../types/records.js'
import type { RuntimeStore } from '../storage/runtime-store.interface.js'

interface LeadOrchestratorOptions {
  logger: Logger
  nlpClient: NLPClient
  deduplicator: MessageDeduplicator
  runtimeStore: RuntimeStore
  hubspot?: HubSpotClient
  responseStyle?: 'casual' | 'professional' | 'warm' | 'concierge'
}

type ResponseStyle = 'casual' | 'professional' | 'warm' | 'concierge'

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

function deriveMessageLeadSnapshot(message: IncomingMessage): Partial<Pick<LeadRecord, 'leadName' | 'email' | 'phone' | 'location'>> {
  const raw = message.rawPayload && typeof message.rawPayload === 'object'
    ? message.rawPayload as Record<string, unknown>
    : {}
  const telegramMessage = raw.message && typeof raw.message === 'object'
    ? raw.message as Record<string, unknown>
    : undefined
  const telegramContact = telegramMessage?.contact && typeof telegramMessage.contact === 'object'
    ? telegramMessage.contact as Record<string, unknown>
    : undefined
  const telegramContactName = telegramContact
    ? normalizeText([telegramContact.first_name, telegramContact.last_name].filter((part) => typeof part === 'string' && part.trim()).join(' '))
    : undefined

  return {
    leadName: normalizeText(message.senderName ?? raw.name ?? telegramContactName),
    email: normalizeText(raw.email),
    phone: normalizeText(raw.phone ?? telegramContact?.phone_number),
    location: normalizeText(raw.location),
  }
}

function deriveNlpMetadata(message: IncomingMessage): Record<string, string> | undefined {
  const raw = message.rawPayload && typeof message.rawPayload === 'object'
    ? message.rawPayload as Record<string, unknown>
    : {}

  const metadata = {
    channel: normalizeText(message.channel),
    senderName: normalizeText(message.senderName),
    sourceId: normalizeText(message.sourceId ?? message.senderId),
    email: normalizeText(raw.email),
    phone: normalizeText(raw.phone),
    location: normalizeText(raw.location),
  }

  const entries = Object.entries(metadata).filter(([, value]) => value)
  return entries.length ? Object.fromEntries(entries) as Record<string, string> : undefined
}

function nextOutboundMessageId(): string {
  return `out_${crypto.randomUUID()}`
}

function isGreetingLikeText(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  return normalized.startsWith('welcome')
    || normalized.startsWith('selamat datang')
    || normalized.startsWith('hai, selamat datang')
    || normalized.startsWith('欢迎')
    || normalized.startsWith('您好')
}

function inferResponseStyle(
  text: string | undefined,
  fallbackStyle: ResponseStyle,
  existingStyle?: ResponseStyle,
): ResponseStyle {
  const normalized = String(text ?? '').trim().toLowerCase()
  if (!normalized) {
    return existingStyle ?? fallbackStyle
  }

  if (normalized.startsWith('/')) {
    return existingStyle ?? fallbackStyle
  }

  const conciergeSignals = [
    'luxury',
    'premium',
    'exclusive',
    'designer',
    'best option',
    'high-end',
    'curate',
    'recommend the best',
  ]
  if (conciergeSignals.some((signal) => normalized.includes(signal))) {
    return 'concierge'
  }

  const professionalSignals = [
    'quotation',
    'quote',
    'pricing',
    'price list',
    'invoice',
    'proposal',
    'please share',
    'please provide',
    'schedule',
    'appointment',
    'consultation',
  ]
  if (professionalSignals.some((signal) => normalized.includes(signal))) {
    return 'professional'
  }

  const warmSignals = [
    'help me',
    'not sure',
    'confused',
    'which is better',
    'can someone help',
    'please help',
    'worried',
    'unsure',
  ]
  if (warmSignals.some((signal) => normalized.includes(signal))) {
    return 'warm'
  }

  if (normalized.length <= 12) {
    return existingStyle ?? fallbackStyle
  }

  return 'casual'
}

function whatsappGreetingHeader(
  senderName: string,
  style: ResponseStyle,
): string {
  switch (style) {
    case 'professional':
      return `Hello *${senderName}*`
    case 'warm':
      return `Welcome *${senderName}*`
    case 'concierge':
      return `Good to have you here, *${senderName}*`
    case 'casual':
    default:
      return `Hi *${senderName}*`
  }
}

function prependWhatsappName(
  text: string,
  senderName: string | undefined,
  style: ResponseStyle,
): string {
  const safeName = normalizeText(senderName)
  if (!safeName) {
    return text
  }

  const trimmed = text.trim()
  const existingHeaders = [
    `Hi *${safeName}*`,
    `Hello *${safeName}*`,
    `Welcome *${safeName}*`,
    `Good to have you here, *${safeName}*`,
  ]
  if (existingHeaders.some((header) => trimmed.startsWith(header))) {
    return text
  }

  return `${whatsappGreetingHeader(safeName, style)}\n\n${trimmed}`
}

function decorateWhatsappMessages(
  message: IncomingMessage,
  outgoingMessages: OutgoingMessage[],
  style: ResponseStyle,
): OutgoingMessage[] {
  if (message.channel !== 'whatsapp' || !message.senderName) {
    return outgoingMessages
  }

  return outgoingMessages.map((outgoingMessage) => {
    if (outgoingMessage.type === 'text' && isGreetingLikeText(outgoingMessage.text)) {
      return {
        ...outgoingMessage,
        text: prependWhatsappName(outgoingMessage.text, message.senderName, style),
      }
    }

    if (outgoingMessage.type === 'choice' && isGreetingLikeText(outgoingMessage.text)) {
      return {
        ...outgoingMessage,
        text: prependWhatsappName(outgoingMessage.text, message.senderName, style),
      }
    }

    return outgoingMessage
  })
}

export class LeadOrchestrator {
  private readonly _logger: Logger
  private readonly _nlpClient: NLPClient
  private readonly _deduplicator: MessageDeduplicator
  private readonly _runtimeStore: RuntimeStore
  private readonly _hubspot?: HubSpotClient
  private readonly _responseStyle: ResponseStyle

  constructor(options: LeadOrchestratorOptions) {
    this._logger = options.logger
    this._nlpClient = options.nlpClient
    this._deduplicator = options.deduplicator
    this._runtimeStore = options.runtimeStore
    this._hubspot = options.hubspot
    this._responseStyle = options.responseStyle ?? 'casual'
  }

  public async process(message: IncomingMessage): Promise<OrchestratedReply | undefined> {
    if (!(await this._deduplicator.shouldProcess(message))) {
      this._logger.warn(`[${message.channel}] Ignoring duplicate message ${message.messageId}`)
      return undefined
    }

    const sourceId = message.sourceId ?? message.senderId
    const lead = await this._runtimeStore.getOrCreateLead({ ...message, sourceId })
    const messageText = message.type === 'interactive'
      ? (message.interactive?.id || message.interactive?.title || message.text)
      : (message.text || message.interactive?.title)
    const inferredResponseStyle = inferResponseStyle(
      messageText,
      this._responseStyle,
      lead.responseStyle,
    )

    await this._runtimeStore.appendConversationMessage(
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

    await this._runtimeStore.appendWebhookEvent({
      channel: message.channel,
      direction: 'inbound',
      path: `/messages/${message.channel}`,
      sourceId,
      conversationId: message.conversationId,
      leadId: lead.id,
      payload: message.rawPayload,
    })

    const messageSnapshot = deriveMessageLeadSnapshot(message)
    const preNlpSnapshot: Partial<LeadRecord> = {}
    if (messageSnapshot.leadName) {
      preNlpSnapshot.leadName = messageSnapshot.leadName
    }
    if (messageSnapshot.email) {
      preNlpSnapshot.email = messageSnapshot.email
    }
    if (messageSnapshot.phone ?? deriveChannelPhone(message)) {
      preNlpSnapshot.phone = messageSnapshot.phone ?? deriveChannelPhone(message)
    }
    if (messageSnapshot.location) {
      preNlpSnapshot.location = messageSnapshot.location
    }
    if (inferredResponseStyle !== lead.responseStyle) {
      preNlpSnapshot.responseStyle = inferredResponseStyle
    }
    const leadWithMessageData = Object.keys(preNlpSnapshot).length
      ? (await this._runtimeStore.updateLead(lead.id, preNlpSnapshot) ?? lead)
      : lead

    if (!messageText) {
      this._logger.warn(`[${message.channel}] Ignoring non-text message for lead ${lead.id}`)
      return {
        lead: leadWithMessageData,
        outgoingMessages: [],
      }
    }

    const nlpResponse = await this._nlpClient.getResponse(message.senderId, messageText, deriveNlpMetadata(message))
    const trackerSnapshot = deriveLeadSnapshot(nlpResponse.tracker)
    if (!trackerSnapshot.leadName) {
      trackerSnapshot.leadName = messageSnapshot.leadName
    }
    if (!trackerSnapshot.email) {
      trackerSnapshot.email = messageSnapshot.email
    }
    if (!trackerSnapshot.phone) {
      trackerSnapshot.phone = messageSnapshot.phone ?? deriveChannelPhone(message)
    }
    if (!trackerSnapshot.location) {
      trackerSnapshot.location = messageSnapshot.location
    }
    const updatedLead = (await this._runtimeStore.updateLead(lead.id, trackerSnapshot)) ?? leadWithMessageData
    const outgoingMessages = decorateWhatsappMessages(
      message,
      mapNlpResponseToOutgoingMessages(nlpResponse),
      inferredResponseStyle,
    )

    for (const outgoingMessage of outgoingMessages) {
      await this._runtimeStore.appendConversationMessage(
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

    await this._runtimeStore.appendWebhookEvent({
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

  public async getSummary() {
    return this._runtimeStore.getSummary()
  }

  public async listLeads() {
    return this._runtimeStore.listLeads()
  }

  public async listConversations() {
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

      await this._runtimeStore.updateLead(lead.id, {
        crmStatus: 'synced',
        crmRecordId: String(hubspotLead.id ?? contact.id),
      })
    } catch (error: any) {
      this._logger.error(`[CRM] Failed to sync qualified lead ${lead.id}: ${error.message}`)
      await this._runtimeStore.updateLead(lead.id, { crmStatus: 'failed' })
    }
  }
}
