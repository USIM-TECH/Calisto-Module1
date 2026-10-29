import assert from 'node:assert/strict'
import test from 'node:test'
import { extractAnthropicText, extractGeminiText, extractOpenAiText } from './llm-provider.js'

test('hosted provider response envelopes normalize to text', () => {
  assert.equal(extractOpenAiText({ choices: [{ message: { content: ' openai ' } }] }), 'openai')
  assert.equal(extractAnthropicText({ content: [{ type: 'text', text: 'anthropic' }] }), 'anthropic')
  assert.equal(extractGeminiText({ candidates: [{ content: { parts: [{ text: 'gemini' }] } }] }), 'gemini')
})

test('hosted provider normalizers reject empty responses', () => {
  assert.throws(() => extractOpenAiText({ choices: [] }), /empty response/i)
  assert.throws(() => extractAnthropicText({ content: [] }), /empty response/i)
  assert.throws(() => extractGeminiText({ candidates: [] }), /empty response/i)
})
