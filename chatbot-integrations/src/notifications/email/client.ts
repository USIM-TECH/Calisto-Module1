import { google, gmail_v1 } from 'googleapis'
import * as nodemailer from 'nodemailer'
import type { Logger } from '../../utils/index.js'

type GmailClient = gmail_v1.Gmail
type GoogleOAuth2Client = InstanceType<(typeof google.auth)['OAuth2']>

export interface GmailConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
  redirectUri?: string
}

/**
 * Gmail Email Client.
 * Extracted from Botpress Gmail integration with Botpress SDK dependencies removed.
 * Uses the official googleapis library and nodemailer for composing.
 */
export class GmailEmailClient {
  private readonly _gmail: GmailClient
  private readonly _logger: Logger

  constructor(config: GmailConfig, logger: Logger) {
    this._logger = logger

    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    )
    oauth2Client.setCredentials({ refresh_token: config.refreshToken })

    this._gmail = google.gmail({ version: 'v1', auth: oauth2Client, timeout: 30000 })
  }

  /** Create from an existing OAuth2 client */
  public static fromOAuth2Client(oauthClient: GoogleOAuth2Client, logger: Logger): GmailEmailClient {
    const instance = Object.create(GmailEmailClient.prototype) as GmailEmailClient
    ;(instance as any)._gmail = google.gmail({ version: 'v1', auth: oauthClient, timeout: 30000 })
    ;(instance as any)._logger = logger
    return instance
  }

  // ── Messages ──────────────────────────────────────────────────────

  /** Get a message by ID */
  public async getMessage(messageId: string) {
    const message = await this._gmail.users.messages.get({ id: messageId, userId: 'me' })
    return message.data
  }

  /** Send a raw RFC 2822 email */
  public async sendRawMessage(raw: string, threadId?: string) {
    const newMail = await this._gmail.users.messages.send({
      requestBody: { raw, threadId },
      userId: 'me',
    })
    return newMail.data
  }

  /** Compose and send an email */
  public async sendEmail({
    to,
    subject,
    body,
    threadId,
  }: {
    to: string
    subject: string
    body: string
    threadId?: string
  }) {
    const raw = await this._composeRawEmail(to, subject, body)
    return this.sendRawMessage(raw, threadId)
  }

  /** Delete a message permanently */
  public async deleteMessage(messageId: string) {
    await this._gmail.users.messages.delete({ id: messageId, userId: 'me' })
  }

  /** Trash a message */
  public async trashMessage(messageId: string) {
    await this._gmail.users.messages.trash({ id: messageId, userId: 'me' })
  }

  /** Untrash a message */
  public async untrashMessage(messageId: string) {
    await this._gmail.users.messages.untrash({ id: messageId, userId: 'me' })
  }

  /** Modify message labels */
  public async modifyMessageLabels(messageId: string, addLabelIds?: string[], removeLabelIds?: string[]) {
    await this._gmail.users.messages.modify({
      id: messageId,
      userId: 'me',
      requestBody: { addLabelIds, removeLabelIds },
    })
  }

  /** Get a message attachment */
  public async getMessageAttachment(messageId: string, attachmentId: string) {
    const attachment = await this._gmail.users.messages.attachments.get({
      id: attachmentId,
      messageId,
      userId: 'me',
    })
    return attachment.data
  }

  // ── Threads ───────────────────────────────────────────────────────

  /** List threads */
  public async listThreads() {
    const threads = await this._gmail.users.threads.list({ userId: 'me' })
    return threads.data
  }

  /** Get a thread by ID */
  public async getThread(threadId: string) {
    const thread = await this._gmail.users.threads.get({ id: threadId, userId: 'me' })
    return thread.data
  }

  /** Trash a thread */
  public async trashThread(threadId: string) {
    await this._gmail.users.threads.trash({ id: threadId, userId: 'me' })
  }

  /** Untrash a thread */
  public async untrashThread(threadId: string) {
    await this._gmail.users.threads.untrash({ id: threadId, userId: 'me' })
  }

  // ── Labels ────────────────────────────────────────────────────────

  /** List all labels */
  public async listLabels() {
    const labels = await this._gmail.users.labels.list({ userId: 'me' })
    return labels.data
  }

  /** Get a label by ID */
  public async getLabel(labelId: string) {
    const label = await this._gmail.users.labels.get({ id: labelId, userId: 'me' })
    return label.data
  }

  /** Create a label */
  public async createLabel(name: string) {
    const label = await this._gmail.users.labels.create({ requestBody: { name }, userId: 'me' })
    return label.data
  }

  /** Delete a label */
  public async deleteLabel(labelId: string) {
    await this._gmail.users.labels.delete({ id: labelId, userId: 'me' })
  }

  // ── Drafts ────────────────────────────────────────────────────────

  /** List drafts */
  public async listDrafts() {
    const drafts = await this._gmail.users.drafts.list({ userId: 'me' })
    return drafts.data
  }

  /** Get a draft by ID */
  public async getDraft(draftId: string) {
    const draft = await this._gmail.users.drafts.get({ id: draftId, userId: 'me' })
    return draft.data
  }

  /** Create a draft */
  public async createDraft(to: string, subject: string, body: string) {
    const raw = await this._composeRawEmail(to, subject, body)
    const draft = await this._gmail.users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw } },
    })
    return draft.data
  }

  /** Delete a draft */
  public async deleteDraft(draftId: string) {
    await this._gmail.users.drafts.delete({ id: draftId, userId: 'me' })
  }

  /** Send a draft */
  public async sendDraft(draftId: string) {
    const sent = await this._gmail.users.drafts.send({
      userId: 'me',
      requestBody: { id: draftId },
    })
    return sent.data
  }

  // ── Profile ───────────────────────────────────────────────────────

  /** Get the authenticated user's email address */
  public async getMyEmail(): Promise<string | null | undefined> {
    const profile = await this._gmail.users.getProfile({ userId: 'me' })
    return profile.data.emailAddress
  }

  /** Get mail history (for webhook-based change tracking) */
  public async getHistory(startHistoryId: string) {
    const history = await this._gmail.users.history.list({
      startHistoryId,
      historyTypes: ['messageAdded'],
      userId: 'me',
    })
    return history.data
  }

  // ── Private Helpers ───────────────────────────────────────────────

  private async _composeRawEmail(to: string, subject: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const transport = nodemailer.createTransport({ streamTransport: true })
      const mailOptions = {
        to,
        subject,
        text: body,
        html: body,
        encoding: 'base64' as const,
      }

      transport.sendMail(mailOptions, (err, info) => {
        if (err) {
          reject(err)
          return
        }

        const stream = info.message as import('stream').Readable
        let raw = ''
        stream.on('data', (chunk: Buffer) => {
          raw += chunk.toString('base64')
        })
        stream.on('end', () => {
          // URL-safe base64
          const urlSafe = raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          resolve(urlSafe)
        })
        stream.on('error', reject)
      })
    })
  }
}
