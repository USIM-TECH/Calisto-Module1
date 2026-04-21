export type ReasoningEmotion =
  | 'neutral'
  | 'confused'
  | 'frustrated'
  | 'hesitant'
  | 'interested'

export type ReasoningStrategy = 'slot' | 'rasa_parse' | 'llm' | 'heuristic'

export interface ReasoningDecision {
  intent: string
  isSlotValid: boolean
  isInterruption: boolean
  emotion: ReasoningEmotion
  useRag: boolean
  response?: string
}

export interface ConversationFlowState {
  currentFlow?: string
  expectedSlot?: string
  activeLoop?: string
}

export interface ReasoningEvaluation extends ReasoningDecision, ConversationFlowState {
  rasaIntent: string
  strategy: ReasoningStrategy
  parseConfidence?: number
  shouldDeactivateFlow: boolean
  shouldForceRasaIntent: boolean
}

export interface LocalReasoningRequest extends ConversationFlowState {
  userInput: string
  candidateIntent?: string
  rasaIntent?: string
  candidateConfidence?: number
}

export interface RewriteRequest {
  userInput: string
  rasaResponse: string
  emotion: string
  intent: string
}
