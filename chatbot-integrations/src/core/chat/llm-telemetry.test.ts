import assert from 'node:assert/strict'
import test from 'node:test'
import { LlmTelemetry, estimateCost, estimateUsage } from './llm-telemetry.js'

test('telemetry estimates token cost and aggregates provider calls', () => {
  const usage = estimateUsage('12345678', '1234')
  assert.equal(usage.inputTokens, 2)
  assert.equal(usage.outputTokens, 1)
  assert.equal(estimateCost(usage, { inputPer1k: 1, outputPer1k: 2 }), 0.004)
  const telemetry = new LlmTelemetry({ 'ollama:llama3': { inputPer1k: 0, outputPer1k: 0 } })
  telemetry.record({ requestId: 'r1', provider: 'ollama', model: 'llama3', stage: 'planner', startedAt: new Date(0).toISOString(), durationMs: 12, success: true, usage })
  const snapshot = telemetry.snapshot()
  assert.equal(snapshot.totalRequests, 1)
  assert.equal(snapshot.byProvider['ollama:llama3'].successes, 1)
  assert.equal(snapshot.events[0].requestId, 'r1')
})
