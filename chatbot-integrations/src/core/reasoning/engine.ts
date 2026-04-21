import type { NLPClient, NLPParseResponse, NLPRequestMetadata } from '../utils/nlp-client.js'
import type { Logger } from '../utils/logger.js'
import { FAQ_REASONING_INTENTS, FAQ_REASONING_INTENT_TO_RASA_INTENT, FORCEABLE_RASA_INTENTS, RASA_INTENT_TO_FLOW } from './constants.js'
import { LocalReasoningClient } from './client.js'
import { detectEmotion } from './emotion.js'
import type { ConversationFlowState, ReasoningEvaluation, RewriteRequest } from './types.js'
import { inferSlotIntent, isExpectedSlotValue } from './validators.js'

interface ReasoningEngineOptions {
  logger: Logger
  nlpClient: NLPClient
  localReasoningClient: LocalReasoningClient
  fastPathConfidence: number
}

export interface EvaluateReasoningInput {
  userId: string
  userInput: string
  state: ConversationFlowState
  metadata?: NLPRequestMetadata
  parseResult?: NLPParseResponse
  llmPolicy?: 'auto' | 'never' | 'always'
}

function normalizeIntent(value: string | undefined): string {
  return String(value ?? '').trim()
}

function fallbackIntentForFlow(currentFlow: string | undefined): string | undefined {
  switch (currentFlow) {
    case 'lead_capture':
      return 'capture_lead'
    case 'pricing':
      return 'ask_pricing'
    case 'browse_eyewear':
      return 'browse_eyewear'
    case 'lens_consultation':
      return 'lens_vision_solutions'
    case 'store_lookup':
      return 'find_a_store'
    case 'product_search':
      return 'search_product'
    case 'product_recommendation':
      return 'product_recommendation'
    case 'faq':
      return 'ask_faq'
    default:
      return undefined
  }
}

function mapReasoningIntentToRasaIntent(intent: string, fallbackIntent?: string, currentFlow?: string): string {
  if (intent in FAQ_REASONING_INTENT_TO_RASA_INTENT) {
    return FAQ_REASONING_INTENT_TO_RASA_INTENT[intent as keyof typeof FAQ_REASONING_INTENT_TO_RASA_INTENT]
  }

  if (intent === 'ask_product') {
    return fallbackIntent && normalizeIntent(fallbackIntent) ? fallbackIntent : 'search_product'
  }

  if (intent === 'general_query') {
    return fallbackIntent && normalizeIntent(fallbackIntent)
      ? fallbackIntent
      : (fallbackIntentForFlow(currentFlow) ?? 'ask_faq')
  }

  return intent
}

function inferFlowFromIntent(intent: string | undefined): string | undefined {
  const normalized = normalizeIntent(intent)
  return normalized
    ? RASA_INTENT_TO_FLOW[normalized as keyof typeof RASA_INTENT_TO_FLOW]
    : undefined
}

function shouldUseRagForIntent(intent: string, userInput: string): boolean {
  if (FAQ_REASONING_INTENTS.has(intent) || intent === 'ask_faq') {
    return true
  }

  const normalized = userInput.toLowerCase()
  return [
    'return policy',
    'refund',
    'exchange policy',
    'warranty',
    'company',
    'about calisto',
    'about your company',
  ].some((token) => normalized.includes(token))
}

function deriveInterruption(currentFlow: string | undefined, rasaIntent: string, isSlotValid: boolean): boolean {
  if (!currentFlow || isSlotValid) {
    return false
  }

  const nextFlow = inferFlowFromIntent(rasaIntent)
  return Boolean(nextFlow && nextFlow !== currentFlow)
}

export class ReasoningEngine {
  private readonly _logger: Logger
  private readonly _nlpClient: NLPClient
  private readonly _localReasoningClient: LocalReasoningClient
  private readonly _fastPathConfidence: number

  constructor(options: ReasoningEngineOptions) {
    this._logger = options.logger
    this._nlpClient = options.nlpClient
    this._localReasoningClient = options.localReasoningClient
    this._fastPathConfidence = options.fastPathConfidence
  }

  public async evaluate(input: EvaluateReasoningInput): Promise<ReasoningEvaluation> {
    const { userInput, state, metadata } = input
    const currentFlow = state.currentFlow
    const expectedSlot = state.expectedSlot
    const activeLoop = state.activeLoop
    const emotion = detectEmotion(userInput, expectedSlot)

    if (expectedSlot && isExpectedSlotValue(expectedSlot, userInput)) {
      const rasaIntent = inferSlotIntent(expectedSlot)
      return {
        currentFlow,
        expectedSlot,
        activeLoop,
        intent: rasaIntent,
        rasaIntent,
        isSlotValid: true,
        isInterruption: false,
        emotion,
        useRag: false,
        strategy: 'slot',
        shouldDeactivateFlow: false,
        shouldForceRasaIntent: false,
      }
    }

    const parseResult = input.parseResult ?? await this._nlpClient.parseMessage(userInput, metadata)
    const parseIntent = normalizeIntent(parseResult?.intent?.name)
    const parseConfidence = parseResult?.intent?.confidence ?? 0
    const parseUseRag = shouldUseRagForIntent(parseIntent, userInput)

    const fastDecision: ReasoningEvaluation = {
      currentFlow,
      expectedSlot,
      activeLoop,
      intent: parseIntent || 'general_query',
      rasaIntent: parseIntent || 'ask_faq',
      isSlotValid: false,
      isInterruption: deriveInterruption(currentFlow, parseIntent, false),
      emotion,
      useRag: parseUseRag,
      strategy: parseIntent ? 'rasa_parse' : 'heuristic',
      parseConfidence,
      shouldDeactivateFlow: Boolean(activeLoop && deriveInterruption(currentFlow, parseIntent, false)),
      shouldForceRasaIntent: false,
    }

    const llmPolicy = input.llmPolicy ?? 'auto'
    const shouldCallLlm = llmPolicy === 'always'
      || (llmPolicy === 'auto' && (!parseIntent || parseConfidence < this._fastPathConfidence))

    if (!shouldCallLlm) {
      return fastDecision
    }

    const llmDecision = await this._localReasoningClient.reason({
      currentFlow,
      expectedSlot,
      activeLoop,
      userInput,
      candidateIntent: fastDecision.intent,
      rasaIntent: parseIntent,
      candidateConfidence: parseConfidence,
    })

    if (!llmDecision) {
      return {
        ...fastDecision,
        strategy: parseIntent ? 'rasa_parse' : 'heuristic',
      }
    }

    const rasaIntent = mapReasoningIntentToRasaIntent(llmDecision.intent, parseIntent, currentFlow)
    const useRag = shouldUseRagForIntent(llmDecision.intent, userInput) || shouldUseRagForIntent(rasaIntent, userInput)
    const isSlotValid = expectedSlot ? isExpectedSlotValue(expectedSlot, userInput) : llmDecision.isSlotValid
    const isInterruption = deriveInterruption(currentFlow, rasaIntent, isSlotValid)

    this._logger.debug(
      `[Reasoning] Escalated to local LLM: intent="${llmDecision.intent}" rasa="${rasaIntent}" slot=${isSlotValid} interruption=${isInterruption}`,
    )

    return {
      currentFlow,
      expectedSlot,
      activeLoop,
      intent: llmDecision.intent,
      rasaIntent,
      isSlotValid,
      isInterruption,
      emotion: llmDecision.emotion,
      useRag,
      strategy: 'llm',
      parseConfidence,
      shouldDeactivateFlow: Boolean(activeLoop && isInterruption && !isSlotValid),
      shouldForceRasaIntent: llmDecision.intent !== 'general_query'
        && FORCEABLE_RASA_INTENTS.has(rasaIntent)
        && (!parseIntent || parseConfidence < this._fastPathConfidence),
    }
  }

  public async rewrite(input: RewriteRequest): Promise<string> {
    const enhanced = await this._localReasoningClient.rewrite(input)
    return enhanced || input.rasaResponse
  }
}
