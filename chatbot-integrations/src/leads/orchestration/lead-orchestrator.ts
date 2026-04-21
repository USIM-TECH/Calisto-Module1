import crypto from 'crypto'
import type { IncomingMessage, OutgoingMessage } from '../../core/types.js'
import { adaptMessagesForEmotion, type ReasoningEngine, type ReasoningEvaluation } from '../../core/reasoning/index.js'
import type { NLPClient, Logger, NLPRequestMetadata, NLPTrackerSnapshot } from '../../core/utils/index.js'
import type { HubSpotClient } from '../../integrations/crm/hubspot/index.js'
import type { MessageDeduplicator } from './message-deduplicator.js'
import { mapNlpResponseToOutgoingMessages } from './rasa-outgoing.js'
import type { LeadRecord } from '../types/records.js'
import { RuntimeStore } from '../storage/runtime-store.js'

interface LeadOrchestratorOptions {
  logger: Logger
  nlpClient: NLPClient
  reasoningEngine: ReasoningEngine
  deduplicator: MessageDeduplicator
  runtimeStore: RuntimeStore
  hubspot?: HubSpotClient
  responseStyle?: 'casual' | 'professional' | 'warm' | 'concierge'
  emotionAdaptationEnabled?: boolean
}

type ResponseStyle = 'casual' | 'professional' | 'warm' | 'concierge'

const FINAL_FALLBACK_MESSAGE = "I'm having trouble right now. Please try again shortly."
const LOW_CONFIDENCE_THRESHOLD = 0.7

export interface OrchestratedReply {
  lead: LeadRecord
  outgoingMessages: OutgoingMessage[]
  reasoning: ReasoningEvaluation
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed || undefined
}

function deriveLeadSnapshot(
  tracker: NLPTrackerSnapshot | undefined,
  reasoning?: ReasoningEvaluation,
) {
  const slots = tracker?.slots ?? {}
  const trackerCurrentFlow = normalizeText(slots.current_flow)
  const trackerExpectedSlot = normalizeText(tracker?.requestedSlot ?? slots.requested_slot)
  const trackerActiveLoop = normalizeText(tracker?.activeLoop)
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
    aiState: {
      currentFlow: trackerCurrentFlow
        ?? (tracker?.activeLoop === 'lead_capture_form' ? 'lead_capture' : undefined)
        ?? (tracker ? undefined : reasoning?.currentFlow),
      expectedSlot: trackerExpectedSlot ?? (tracker ? undefined : reasoning?.expectedSlot),
      activeLoop: trackerActiveLoop ?? (tracker ? undefined : reasoning?.activeLoop),
      intent: reasoning?.intent ?? tracker?.latestIntent,
      rasaIntent: tracker?.latestIntent ?? reasoning?.rasaIntent,
      intentConfidence: tracker?.latestIntentConfidence ?? reasoning?.parseConfidence,
      emotion: reasoning?.emotion,
      useRag: reasoning?.useRag,
      isInterruption: reasoning?.isInterruption,
      isSlotValid: reasoning?.isSlotValid,
      strategy: reasoning?.strategy,
      updatedAt: new Date().toISOString(),
    },
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

function deriveNlpMetadata(message: IncomingMessage): NLPRequestMetadata | undefined {
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
  return entries.length ? Object.fromEntries(entries) : undefined
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
  private readonly _reasoningEngine: ReasoningEngine
  private readonly _deduplicator: MessageDeduplicator
  private readonly _runtimeStore: RuntimeStore
  private readonly _hubspot?: HubSpotClient
  private readonly _responseStyle: ResponseStyle
  private readonly _emotionAdaptationEnabled: boolean

  constructor(options: LeadOrchestratorOptions) {
    this._logger = options.logger
    this._nlpClient = options.nlpClient
    this._reasoningEngine = options.reasoningEngine
    this._deduplicator = options.deduplicator
    this._runtimeStore = options.runtimeStore
    this._hubspot = options.hubspot
    this._responseStyle = options.responseStyle ?? 'casual'
    this._emotionAdaptationEnabled = options.emotionAdaptationEnabled ?? true
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
    const inferredResponseStyle = inferResponseStyle(
      messageText,
      this._responseStyle,
      lead.responseStyle,
    )

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
      ? (this._runtimeStore.updateLead(lead.id, preNlpSnapshot) ?? lead)
      : lead

    if (!messageText) {
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

      this._logger.warn(`[${message.channel}] Ignoring non-text message for lead ${lead.id}`)
      return {
        lead: leadWithMessageData,
        outgoingMessages: [],
        reasoning: {
          currentFlow: leadWithMessageData.aiState?.currentFlow,
          expectedSlot: leadWithMessageData.aiState?.expectedSlot,
          activeLoop: leadWithMessageData.aiState?.activeLoop,
          intent: leadWithMessageData.aiState?.intent ?? 'general_query',
          rasaIntent: leadWithMessageData.aiState?.rasaIntent ?? 'ask_faq',
          isSlotValid: false,
          isInterruption: false,
          emotion: leadWithMessageData.aiState?.emotion ?? 'neutral',
          useRag: Boolean(leadWithMessageData.aiState?.useRag),
          strategy: leadWithMessageData.aiState?.strategy ?? 'heuristic',
          shouldDeactivateFlow: false,
          shouldForceRasaIntent: false,
        },
      }
    }

    const baseMetadata = deriveNlpMetadata(message)
    const requestMetadata: NLPRequestMetadata | undefined = baseMetadata
      ? { ...baseMetadata, originalText: messageText }
      : { originalText: messageText }
    const cachedAiState = leadWithMessageData.aiState
    const trackerBefore = cachedAiState?.updatedAt ? undefined : await this._nlpClient.getTracker(message.senderId)
    const conversationState = deriveLeadSnapshot(trackerBefore).aiState ?? cachedAiState ?? {}

    // Phase 1: Reasoning (Intent & Emotion detection)
    // We call parseMessage first to help the reasoning engine
    const parseResult = await this._nlpClient.parseMessage(messageText, requestMetadata)
    const parseConfidence = parseResult?.intent?.confidence ?? 0
    const lowConfidence = !parseResult?.intent?.name || parseConfidence < LOW_CONFIDENCE_THRESHOLD

    const reasoning = await this._reasoningEngine.evaluate({
      userId: message.senderId,
      userInput: messageText,
      state: {
        currentFlow: cachedAiState?.currentFlow ?? conversationState.currentFlow,
        expectedSlot: cachedAiState?.expectedSlot ?? conversationState.expectedSlot,
        activeLoop: cachedAiState?.activeLoop ?? conversationState.activeLoop,
      },
      metadata: requestMetadata,
      parseResult,
      llmPolicy: 'always', // Always reason about emotion/tone in Dual-Phase mode
    })

    // Phase 2: Action (Call Rasa with untampered query)
    const nlpResponse = await this._nlpClient.getResponse(message.senderId, messageText, requestMetadata)
    const isConnectionError = nlpResponse.isConnectionError

    if (isConnectionError) {
      this._logger.warn(`[Orchestrator] Rasa connection failure detected for ${message.senderId}.`)
    }

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
          reasoningIntent: reasoning.intent,
          rasaIntent: reasoning.rasaIntent,
          reasoningEmotion: reasoning.emotion,
          reasoningUseRag: reasoning.useRag,
          reasoningIsInterruption: reasoning.isInterruption,
          reasoningIsSlotValid: reasoning.isSlotValid,
          reasoningStrategy: reasoning.strategy,
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
      payload: {
        raw: message.rawPayload,
        reasoning,
      },
    })

    if (reasoning.shouldDeactivateFlow) {
      await this._nlpClient.deactivateActiveFlow(message.senderId)
    }
    const trackerSnapshot = deriveLeadSnapshot(nlpResponse.tracker, reasoning)
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
    const updatedLead = this._runtimeStore.updateLead(lead.id, trackerSnapshot) ?? leadWithMessageData
    let responseMessages: OutgoingMessage[]

    // Phase 3: Rewriting (Tone & Emotion enhancement)
    if (nlpResponse.ok && !nlpResponse.fallbackUsed) {
      const rawMessages = mapNlpResponseToOutgoingMessages(nlpResponse)
      responseMessages = []

      for (const msg of rawMessages) {
        if (msg.type === 'text' && msg.text.trim()) {
          this._logger.debug(`[Orchestrator] Rewriting Rasa response for tone: "${msg.text.substring(0, 50)}..."`)
          const enhancedText = await this._reasoningEngine.rewrite({
            userInput: messageText,
            rasaResponse: msg.text,
            emotion: reasoning.emotion,
            intent: reasoning.intent,
          })
          responseMessages.push({ type: 'text', text: enhancedText })
        } else {
          responseMessages.push(msg)
        }
      }
    } else if (nlpResponse.ok) {
      // Rasa succeeded but returned empty or fallback
      responseMessages = mapNlpResponseToOutgoingMessages(nlpResponse)
    } else if (isConnectionError) {
      // Rasa connection failed
      this._logger.error(`[Orchestrator] Rasa unreachable. Using system fallback.`)
      responseMessages = [{ type: 'text', text: FINAL_FALLBACK_MESSAGE }]
    } else {
      // General NLP failure
      responseMessages = [{ type: 'text', text: FINAL_FALLBACK_MESSAGE }]
    }

    if (!responseMessages.length) {
      responseMessages = [{ type: 'text', text: FINAL_FALLBACK_MESSAGE }]
    }

    const outgoingMessages = adaptMessagesForEmotion(
      decorateWhatsappMessages(message, responseMessages, inferredResponseStyle),
      reasoning.emotion,
      this._emotionAdaptationEnabled,
    )

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

    return { lead: updatedLead, outgoingMessages, reasoning }
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
