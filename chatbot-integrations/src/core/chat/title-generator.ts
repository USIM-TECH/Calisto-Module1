import type { LlmProvider } from './llm-provider.js'

export interface TitleTurn {
  role: 'user' | 'assistant'
  content: string
}

const MAX_TURNS = 4
const MAX_TURN_CHARS = 400
const MAX_TITLE_CHARS = 48

/** Asks the LLM for a 2-5 word conversation title; returns undefined if it can't produce a usable one. */
export async function generateConversationTitle(
  provider: LlmProvider,
  turns: TitleTurn[],
): Promise<string | undefined> {
  const transcript = turns
    .slice(0, MAX_TURNS)
    .map((turn) => `${turn.role === 'user' ? 'Customer' : 'Assistant'}: ${turn.content.slice(0, MAX_TURN_CHARS)}`)
    .join('\n')
  if (!transcript.trim()) return undefined

  const raw = await provider.generate(
    [
      {
        role: 'system',
        content:
          'You name chat conversations. Reply with only a title of 2 to 5 words that captures what the customer wants. ' +
          'Use the same language as the customer. No quotes, no trailing punctuation, no explanation.',
      },
      { role: 'user', content: transcript },
    ],
    { temperature: 0.2, stage: 'title' },
  )

  const title = raw
    .split('\n')[0]
    .replace(/^["'`*#\s]+|["'`*.\s]+$/g, '')
    .replace(/^title:\s*/i, '')
    .trim()
  if (!title) return undefined
  return title.length > MAX_TITLE_CHARS ? `${title.slice(0, MAX_TITLE_CHARS)}…` : title
}
