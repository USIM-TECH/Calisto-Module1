import crypto from 'crypto'
import type { IncomingMessage, OutgoingMessage } from '../../core/types.js'
import type { NLPClient, NLPRequestMetadata, Logger } from '../../core/utils/index.js'
import type { HubSpotClient } from '../../integrations/crm/hubspot/index.js'
import type { MessageDeduplicator } from './message-deduplicator.js'
import { mapNlpResponseToOutgoingMessages } from './rasa-outgoing.js'
import { normalizeBrand } from './normalization.js'
import type { ChannelIdentityRecord, CustomerRecord, InterestKind } from '../types/records.js'
import type {
  CustomerSnapshot,
  IdentitySnapshot,
  RuntimeStore,
} from '../storage/runtime-store.interface.js'
import { normaliseEmail, normalisePhone } from '../storage/helpers.js'

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
  customer: CustomerRecord
  identity: ChannelIdentityRecord
  outgoingMessages: OutgoingMessage[]
}

interface TrackerLeadFields {
  leadName?: string
  email?: string
  phone?: string
  preferredService?: string
  location?: string
}

interface TrackerInterestSamples {
  productType?: string
  brand?: string
  lensType?: string
  useCase?: string
  budget?: string
  urgency?: string
  preferredService?: string
}

const SUPPORTED_INTEREST_KINDS: Array<keyof TrackerInterestSamples> = [
  'productType',
  'brand',
  'lensType',
  'useCase',
  'budget',
  'urgency',
  'preferredService',
]

const SUPPORT_CASE_TYPES = new Set([
  'Return Request',
  'Refund Request',
  'Exchange Request',
  'Warranty Support',
  'Repair Support',
  'Order Tracking/Support',
])

// Internal Rasa intents that should never become CRM tags
const INTERNAL_INTENTS = new Set([
  'nlu_fallback',
  'out_of_scope',
  'session_start',
  'restart',
  'back',
  'affirm',
  'deny',
  'stop',
  'inform',
  'share_name',
  'share_phone',
  'share_email',
  'share_location',
  'share_service_interest',
  'share_timeline',
])

const INTEREST_KIND_MAP: Record<keyof TrackerInterestSamples, InterestKind> = {
  productType: 'product_type',
  brand: 'brand',
  lensType: 'lens_type',
  useCase: 'use_case',
  budget: 'budget',
  urgency: 'urgency',
  preferredService: 'preferred_service',
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function deriveTrackerLeadFields(tracker?: { slots: Record<string, unknown> }): TrackerLeadFields {
  const slots = tracker?.slots ?? {}
  return {
    leadName: normalizeText(slots.lead_name ?? slots.customer_name ?? slots.name),
    email: normalizeText(slots.email),
    phone: normalizeText(slots.contact_number ?? slots.phone_number ?? slots.phone),
    preferredService: normalizeText(slots.preferred_service ?? slots.service_type),
    location: normalizeText(slots.lead_location ?? slots.city ?? slots.location),
  }
}

function deriveTrackerInterestSamples(tracker?: { slots: Record<string, unknown>; latestMessageText?: string }): TrackerInterestSamples & { supportCaseType?: string, supportCaseId?: string, supportCaseStatus?: string } {
  const slots = tracker?.slots ?? {}
  const rawService = normalizeText(slots.preferred_service)
  const isSupportCase = rawService && SUPPORT_CASE_TYPES.has(rawService)
  
  const extractedSupportCaseType = normalizeText(slots.support_case_type)
  const finalSupportCaseType = extractedSupportCaseType || (isSupportCase ? rawService : undefined)

  let detectedBrand = normalizeText(slots.brand_name ?? slots.brand)
  if (!detectedBrand && tracker?.latestMessageText) {
    const text = tracker.latestMessageText.toLowerCase()
    if (text.includes('rayban') || text.includes('ray ban') || text.includes('ray-ban')) {
      detectedBrand = 'Ray-Ban'
    } else if (text.includes('gucci')) {
      detectedBrand = 'Gucci'
    } else if (text.includes('prada')) {
      detectedBrand = 'Prada'
    } else if (text.includes('oakley')) {
      detectedBrand = 'Oakley'
    } else if (text.includes('bausch')) {
      detectedBrand = 'Bausch & Lomb'
    }
  }

  return {
    productType: normalizeText(slots.product_type),
    brand: normalizeBrand(detectedBrand),
    lensType: normalizeText(slots.lens_type),
    useCase: normalizeText(slots.use_case),
    budget: normalizeText(slots.preferred_budget ?? slots.budget),
    urgency: normalizeText(slots.purchase_timeline ?? slots.urgency),
    preferredService: isSupportCase ? undefined : rawService,
    supportCaseType: finalSupportCaseType,
    supportCaseId: normalizeText(slots.support_case_id),
    supportCaseStatus: normalizeText(slots.support_case_status),
  }
}

function deriveQualificationStatus(
  fields: TrackerLeadFields,
  rawStatus: string | undefined,
  fallback: CustomerRecord['qualificationStatus'],
  supportCaseType?: string
): CustomerRecord['qualificationStatus'] {
  if (rawStatus === 'qualified') return 'qualified'
  if (rawStatus === 'unqualified') return 'unqualified'
  
  if (supportCaseType || (fields.preferredService && SUPPORT_CASE_TYPES.has(fields.preferredService))) {
    return fallback
  }
  
  if (fields.leadName || fields.email || fields.phone || fields.location) {
    return 'needs_review'
  }
  
  if (fields.preferredService) {
    return 'needs_review'
  }
  
  return fallback
}

function deriveChannelPhone(message: IncomingMessage): string | undefined {
  if (message.channel !== 'whatsapp') return undefined
  const sourceId = message.sourceId ?? message.senderId
  const normalized = String(sourceId).replace(/[^\d+]/g, '')
  return normalized || undefined
}

function deriveMessageOnlyFields(message: IncomingMessage): { leadName?: string; email?: string; phone?: string; location?: string } {
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
    phone: normalizeText(raw.phone ?? telegramContact?.phone_number) ?? deriveChannelPhone(message),
    location: normalizeText(raw.location),
  }
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
  if (!normalized) return existingStyle ?? fallbackStyle
  if (normalized.startsWith('/')) return existingStyle ?? fallbackStyle

  const conciergeSignals = ['luxury', 'premium', 'exclusive', 'designer', 'best option', 'high-end', 'curate', 'recommend the best']
  if (conciergeSignals.some((signal) => normalized.includes(signal))) return 'concierge'

  const professionalSignals = ['quotation', 'quote', 'pricing', 'price list', 'invoice', 'proposal', 'please share', 'please provide', 'schedule', 'appointment', 'consultation']
  if (professionalSignals.some((signal) => normalized.includes(signal))) return 'professional'

  const warmSignals = ['help me', 'not sure', 'confused', 'which is better', 'can someone help', 'please help', 'worried', 'unsure']
  if (warmSignals.some((signal) => normalized.includes(signal))) return 'warm'

  if (normalized.length <= 12) return existingStyle ?? fallbackStyle
  return 'casual'
}

function whatsappGreetingHeader(senderName: string, style: ResponseStyle): string {
  switch (style) {
    case 'professional': return `Hello *${senderName}*`
    case 'warm': return `Welcome *${senderName}*`
    case 'concierge': return `Good to have you here, *${senderName}*`
    case 'casual':
    default:
      return `Hi *${senderName}*`
  }
}

function prependWhatsappName(text: string, senderName: string | undefined, style: ResponseStyle): string {
  const safeName = normalizeText(senderName)
  if (!safeName) return text

  const trimmed = text.trim()
  const existingHeaders = [
    `Hi *${safeName}*`,
    `Hello *${safeName}*`,
    `Welcome *${safeName}*`,
    `Good to have you here, *${safeName}*`,
  ]
  if (existingHeaders.some((header) => trimmed.startsWith(header))) return text

  return `${whatsappGreetingHeader(safeName, style)}\n\n${trimmed}`
}

function decorateWhatsappMessages(
  message: IncomingMessage,
  outgoingMessages: OutgoingMessage[],
  style: ResponseStyle,
): OutgoingMessage[] {
  if (message.channel !== 'whatsapp' || !message.senderName) return outgoingMessages

  return outgoingMessages.map((outgoingMessage) => {
    if (outgoingMessage.type === 'text' && isGreetingLikeText(outgoingMessage.text)) {
      return { ...outgoingMessage, text: prependWhatsappName(outgoingMessage.text, message.senderName, style) }
    }
    if (outgoingMessage.type === 'choice' && isGreetingLikeText(outgoingMessage.text)) {
      return { ...outgoingMessage, text: prependWhatsappName(outgoingMessage.text, message.senderName, style) }
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
    const messageOnlyFields = deriveMessageOnlyFields(message)

    const identityUpdate: IdentitySnapshot = {
      senderName: message.senderName,
      username: message.username,
      conversationId: message.conversationId,
    }

    let { customer, identity } = await this._runtimeStore.resolveIdentity(message, identityUpdate)
    let workingCustomerId = customer.id

    const messageText = message.type === 'interactive'
      ? (message.interactive?.id || message.interactive?.title || message.text)
      : (message.text || message.interactive?.title)
    const inferredResponseStyle = inferResponseStyle(messageText, this._responseStyle, customer.responseStyle)

    await this._runtimeStore.appendConversationMessage(
      customer.id,
      identity.id,
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
          customerId: customer.id,
          channelIdentityId: identity.id,
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
      customerId: customer.id,
      payload: message.rawPayload,
    })

    const preNlpSnapshot: CustomerSnapshot = {}
    if (!customer.leadName && messageOnlyFields.leadName) preNlpSnapshot.leadName = messageOnlyFields.leadName
    if (!customer.email && messageOnlyFields.email) preNlpSnapshot.email = messageOnlyFields.email
    if (!customer.phone && messageOnlyFields.phone) preNlpSnapshot.phone = messageOnlyFields.phone
    if (!customer.location && messageOnlyFields.location) preNlpSnapshot.location = messageOnlyFields.location
    if (inferredResponseStyle !== customer.responseStyle) preNlpSnapshot.responseStyle = inferredResponseStyle

    if (Object.keys(preNlpSnapshot).length) {
      customer = (await this._runtimeStore.updateCustomer(customer.id, preNlpSnapshot)) ?? customer

      if (preNlpSnapshot.phone || preNlpSnapshot.email) {
        const mergedId = await this._runtimeStore.mergeCustomersByContact(customer.id, {
          phone: preNlpSnapshot.phone,
          email: preNlpSnapshot.email,
        })
        if (mergedId !== customer.id) {
          this._logger.info(
            `[Lead] Merged customer ${customer.id} into ${mergedId} via channel-payload contact match`,
          )
          workingCustomerId = mergedId
          customer = (await this._runtimeStore.getCustomer(mergedId)) ?? customer
        }
      }
    }

    if (!messageText) {
      this._logger.warn(`[${message.channel}] Ignoring non-text message for customer ${customer.id}`)
      return { customer, identity, outgoingMessages: [] }
    }

    const requestMetadata = this._buildPrefillMetadata(message, customer, identity, sourceId)

    const nlpResponse = await this._nlpClient.getResponse(message.senderId, messageText, requestMetadata)

    const trackerFields = deriveTrackerLeadFields(nlpResponse.tracker)
    const trackerInterests = deriveTrackerInterestSamples(nlpResponse.tracker)
    const rawStatus = normalizeText(nlpResponse.tracker?.slots?.lead_status)

    const postSnapshot: CustomerSnapshot = {}
    if (trackerFields.leadName && trackerFields.leadName !== customer.leadName) postSnapshot.leadName = trackerFields.leadName
    if (trackerFields.email && trackerFields.email !== customer.email) postSnapshot.email = trackerFields.email
    if (trackerFields.phone && trackerFields.phone !== customer.phone) postSnapshot.phone = trackerFields.phone
    if (trackerFields.location && trackerFields.location !== customer.location) postSnapshot.location = trackerFields.location
    if (trackerFields.preferredService && trackerFields.preferredService !== customer.preferredService) {
      postSnapshot.preferredService = trackerFields.preferredService
    }
    const newStatus = deriveQualificationStatus(trackerFields, rawStatus, customer.qualificationStatus, trackerInterests.supportCaseType)
    if (newStatus !== customer.qualificationStatus) postSnapshot.qualificationStatus = newStatus
    
    // Only update intent if:
    // 1. It's not an internal intent (nlu_fallback, share_*, etc.)
    // 2. Intent hasn't been set yet (capture initial intent only)
    // 3. Intent has actually changed
    const isInternalIntent = INTERNAL_INTENTS.has(nlpResponse.tracker?.latestIntent || '')
    
    if (
      nlpResponse.tracker?.latestIntent &&
      !isInternalIntent &&
      !customer.lastIntent &&
      nlpResponse.tracker.latestIntent !== customer.lastIntent
    ) {
      postSnapshot.lastIntent = nlpResponse.tracker.latestIntent
    }

    if (Object.keys(postSnapshot).length) {
      customer = (await this._runtimeStore.updateCustomer(customer.id, postSnapshot)) ?? customer

      if (postSnapshot.phone || postSnapshot.email) {
        const mergedId = await this._runtimeStore.mergeCustomersByContact(customer.id, {
          phone: postSnapshot.phone,
          email: postSnapshot.email,
        })
        if (mergedId !== customer.id) {
          this._logger.info(
            `[Lead] Merged customer ${customer.id} into ${mergedId} via tracker contact match`,
          )
          workingCustomerId = mergedId
          customer = (await this._runtimeStore.getCustomer(mergedId)) ?? customer
        }
      }
    }

    for (const kind of SUPPORTED_INTEREST_KINDS) {
      const value = trackerInterests[kind as keyof TrackerInterestSamples]
      if (!value) continue
      await this._runtimeStore.appendInterest(workingCustomerId, INTEREST_KIND_MAP[kind as keyof TrackerInterestSamples], value)
      await this._runtimeStore.appendCurrentInterest(workingCustomerId, INTEREST_KIND_MAP[kind as keyof TrackerInterestSamples], value)
    }

    if (trackerInterests.supportCaseType) {
      if (trackerInterests.supportCaseId) {
        const existingCase = await this._runtimeStore.getSupportCase(trackerInterests.supportCaseId)
        if (!existingCase) {
          await this._runtimeStore.createSupportCase(
            workingCustomerId,
            trackerInterests.supportCaseType,
            trackerInterests.supportCaseStatus || 'pending',
            trackerInterests.supportCaseId
          )
        } else if (trackerInterests.supportCaseStatus && existingCase.status !== trackerInterests.supportCaseStatus) {
           await this._runtimeStore.updateSupportCaseStatus(trackerInterests.supportCaseId, trackerInterests.supportCaseStatus)
        }
      } else {
        await this._runtimeStore.createSupportCase(workingCustomerId, trackerInterests.supportCaseType, trackerInterests.supportCaseStatus || 'pending')
      }
    }

    const outgoingMessages = decorateWhatsappMessages(
      message,
      mapNlpResponseToOutgoingMessages(nlpResponse),
      inferredResponseStyle,
    )

    for (const outgoingMessage of outgoingMessages) {
      await this._runtimeStore.appendConversationMessage(
        customer.id,
        identity.id,
        {
          direction: 'outbound',
          messageId: nextOutboundMessageId(),
          text: outgoingMessage.type === 'text'
            ? outgoingMessage.text
            : ('text' in outgoingMessage ? outgoingMessage.text : undefined),
          messageType: outgoingMessage.type,
          timestamp: new Date().toISOString(),
          metadata: {
            channel: message.channel,
            sourceId,
            conversationId: message.conversationId,
            customerId: customer.id,
            channelIdentityId: identity.id,
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
      customerId: customer.id,
      payload: {
        metadata: {
          channel: message.channel,
          sourceId,
          customerId: customer.id,
          channelIdentityId: identity.id,
          conversationId: message.conversationId,
        },
        messages: outgoingMessages,
      },
    })

    await this._syncQualifiedLead(customer)

    return { customer, identity, outgoingMessages }
  }

  public async getSummary() {
    return this._runtimeStore.getSummary()
  }

  public async listCustomers() {
    return this._runtimeStore.listCustomers()
  }

  public async listConversations() {
    return this._runtimeStore.listConversations()
  }

  public async listInterestsByCustomer(customerId: string) {
    return this._runtimeStore.listInterestsByCustomer(customerId)
  }

  /**
   * Build the metadata payload Rasa receives. We seed it with whatever the
   * customer record already knows so `action_prefill_lead_capture` can skip
   * questions for fields we have on file. Channel-payload values (raw
   * WhatsApp profile, Telegram contact card) act as fallbacks for fields
   * still missing on the customer.
   */
  private _buildPrefillMetadata(
    message: IncomingMessage,
    customer: CustomerRecord,
    identity: ChannelIdentityRecord,
    sourceId: string,
  ): NLPRequestMetadata {
    const fallback = deriveMessageOnlyFields(message)

    const senderName = customer.leadName ?? identity.senderName ?? message.senderName ?? fallback.leadName
    const phone = normalisePhone(customer.phone) ?? normalisePhone(fallback.phone)
    const email = normaliseEmail(customer.email) ?? normaliseEmail(fallback.email)
    const location = customer.location ?? fallback.location
    const preferredService = customer.preferredService

    const metadata: NLPRequestMetadata = {
      channel: message.channel,
      sourceId,
    }
    if (senderName) metadata.senderName = senderName
    if (phone) metadata.phone = phone
    if (email) metadata.email = email
    if (location) metadata.location = location
    if (preferredService) (metadata as Record<string, unknown>).preferred_service = preferredService

    return metadata
  }

  private async _syncQualifiedLead(customer: CustomerRecord): Promise<void> {
    if (!this._hubspot || customer.qualificationStatus !== 'qualified') return

    try {
      const existing = await this._hubspot.searchContact({
        email: customer.email,
        phone: customer.phone,
      }).catch(() => undefined)

      const primaryIdentity = (await this._runtimeStore.listConversations())
        .find((c) => c.customerId === customer.id)

      const channel = primaryIdentity?.channel ?? 'website'
      const sourceId = primaryIdentity?.sourceId ?? customer.id

      const contactProperties = {
        firstname: customer.leadName ?? 'Unknown',
        phone: customer.phone ?? '',
        city: customer.location ?? '',
        lifecyclestage: 'lead',
        hs_lead_status: customer.qualificationStatus,
        favorite_product: customer.preferredService ?? '',
        channel_source: channel,
        source_id: sourceId,
        customer_id: customer.id,
      }

      const contact = existing
        ? await this._hubspot.updateContact({
            contactId: existing.id,
            email: customer.email,
            phone: customer.phone,
            additionalProperties: contactProperties,
          })
        : await this._hubspot.createContact({
            email: customer.email,
            phone: customer.phone,
            additionalProperties: contactProperties,
          })

      const leadName = customer.preferredService
        ? `${customer.preferredService} lead`
        : `Lead from ${channel}`

      const hubspotLead = await this._hubspot.createLead({
        leadName,
        additionalProperties: {
          hs_pipeline_stage: 'qualified',
          source_channel: channel,
          source_id: sourceId,
          linked_contact_id: String(contact.id),
          qualification_status: customer.qualificationStatus,
        },
      })

      await this._runtimeStore.updateCustomer(customer.id, {
        crmStatus: 'synced',
        crmRecordId: String(hubspotLead.id ?? contact.id),
      })
    } catch (error: any) {
      this._logger.error(`[CRM] Failed to sync qualified customer ${customer.id}: ${error.message}`)
      await this._runtimeStore.updateCustomer(customer.id, { crmStatus: 'failed' })
    }
  }
}
