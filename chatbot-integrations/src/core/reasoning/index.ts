export { LocalReasoningClient, type LocalReasoningClientConfig } from './client.js'
export { ReasoningEngine, type EvaluateReasoningInput } from './engine.js'
export { adaptMessagesForEmotion } from './response-modifier.js'
export type {
  ConversationFlowState,
  LocalReasoningRequest,
  ReasoningDecision,
  ReasoningEmotion,
  ReasoningEvaluation,
  ReasoningStrategy,
} from './types.js'
