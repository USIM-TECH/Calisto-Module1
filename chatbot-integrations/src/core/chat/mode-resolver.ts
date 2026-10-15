import type { IncomingMessage } from '../types.js'

export type ResponseMode = 'payload' | 'chat'

export interface WebchatModeSource {
  getResponseMode(): Promise<ResponseMode>
}

const WEBCHAT_CACHE_MS = 5_000

/**
 * Decides, per incoming message, whether the bot answers with the Rasa
 * payload flow or the free-text chat assistant.
 *
 * - Social channels: the mode lives on the ChannelAccount. The registry keeps
 *   those in memory and reloads them whenever an admin saves a change, so this
 *   lookup needs no database call.
 * - Webchat has no account row, so its mode is read from WebchatSettings and
 *   cached for a few seconds to avoid a query on every message.
 * - Anything unknown (X, missing account) stays on `payload`.
 */
export class ResponseModeResolver {
  private _webchat?: { mode: ResponseMode; expiresAt: number }

  constructor(
    private readonly _accountMode: (accountId: string) => ResponseMode | undefined,
    private readonly _webchatSource?: WebchatModeSource,
  ) {}

  public async resolve(message: Pick<IncomingMessage, 'channel' | 'accountId'>): Promise<ResponseMode> {
    if (message.channel === 'website') return this._resolveWebchat()
    return message.accountId ? (this._accountMode(message.accountId) ?? 'payload') : 'payload'
  }

  private async _resolveWebchat(): Promise<ResponseMode> {
    if (!this._webchatSource) return 'payload'
    const now = Date.now()
    if (this._webchat && this._webchat.expiresAt > now) return this._webchat.mode
    const mode = await this._webchatSource.getResponseMode().catch(() => 'payload' as const)
    this._webchat = { mode, expiresAt: now + WEBCHAT_CACHE_MS }
    return mode
  }
}
