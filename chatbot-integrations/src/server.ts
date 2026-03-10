import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { WhatsAppChannel } from './channels/whatsapp/index.js'
import { InstagramChannel } from './channels/instagram/index.js'
import { MessengerChannel } from './channels/messenger/index.js'
import { HubSpotClient } from './crm/hubspot/index.js'
import { GSheetsClient } from './data/gsheets/index.js'
import { GmailEmailClient } from './notifications/email/index.js'
import { createWebhookRouter } from './webhook/index.js'
import { ConsoleLogger, NLPClient, type Logger } from './utils/index.js'

// Load environment variables (resolve .env relative to project root)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const logger: Logger = new ConsoleLogger()
const PORT = parseInt(process.env.PORT ?? '3000', 10)

// ── Initialize NLP Client ───────────────────────────────────────
const RASA_URL = process.env.RASA_URL || 'http://localhost:5005'
const nlpClient = new NLPClient({ rasaUrl: RASA_URL }, logger)
logger.info(`🧠 NLP client configured → ${RASA_URL}`)

// ── Initialize Channels (based on available env vars) ────────────

let whatsapp: WhatsAppChannel | undefined
let instagram: InstagramChannel | undefined
let messenger: MessengerChannel | undefined
let hubspot: HubSpotClient | undefined
let gsheets: GSheetsClient | undefined
let gmail: GmailEmailClient | undefined

// WhatsApp
if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_VERIFY_TOKEN) {
  whatsapp = new WhatsAppChannel(
    {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
      clientSecret: process.env.WHATSAPP_CLIENT_SECRET,
      apiVersion: process.env.WHATSAPP_API_VERSION,
    },
    logger
  )
  // Register message handler (NLP connection point)
  whatsapp.onMessage(async (message) => {
    logger.info(`[WhatsApp] Incoming: ${JSON.stringify(message)}`)
    // TODO: Connect your NLP / chatbot logic here
  })
  logger.info('✅ WhatsApp channel initialized')
}

// Instagram
if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_ID && process.env.INSTAGRAM_VERIFY_TOKEN) {
  const igChannel = new InstagramChannel(
    {
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
      instagramId: process.env.INSTAGRAM_ID,
      verifyToken: process.env.INSTAGRAM_VERIFY_TOKEN,
      clientId: process.env.INSTAGRAM_CLIENT_ID ?? '',
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
      apiVersion: process.env.INSTAGRAM_API_VERSION,
    },
    logger
  )
  igChannel.onMessage(async (message) => {
    logger.info(`[Instagram] Incoming: ${JSON.stringify(message)}`)

    // Extract the text to send to the NLP
    const messageText = message.text || message.interactive?.title
    if (!messageText) {
      logger.warn(`[Instagram] No text content in message from ${message.senderId}, skipping NLP`)
      return
    }

    try {
      // Send to NLP and get response
      const nlpResponse = await nlpClient.getResponse(message.senderId, messageText)
      logger.info(`[Instagram] NLP response for ${message.senderId}: ${nlpResponse.text.substring(0, 100)}...`)

      // Send the NLP response back to the user on Instagram
      await igChannel.sendTextMessage(message.senderId, nlpResponse.text)
      logger.info(`[Instagram] Reply sent to ${message.senderId}`)
    } catch (error: any) {
      logger.error(`[Instagram] Failed to process/reply: ${error.message}`)
      try {
        await igChannel.sendTextMessage(
          message.senderId,
          'Sorry, something went wrong. Please try again.'
        )
      } catch (sendError: any) {
        logger.error(`[Instagram] Failed to send fallback message: ${sendError.message}`)
      }
    }
  })
  instagram = igChannel
  logger.info('✅ Instagram channel initialized with NLP integration')
}

// Messenger
if (process.env.MESSENGER_PAGE_ACCESS_TOKEN && process.env.MESSENGER_PAGE_ID && process.env.MESSENGER_VERIFY_TOKEN) {
  messenger = new MessengerChannel(
    {
      pageAccessToken: process.env.MESSENGER_PAGE_ACCESS_TOKEN,
      pageId: process.env.MESSENGER_PAGE_ID,
      verifyToken: process.env.MESSENGER_VERIFY_TOKEN,
      clientId: process.env.MESSENGER_CLIENT_ID ?? '',
      clientSecret: process.env.MESSENGER_CLIENT_SECRET,
      appToken: process.env.MESSENGER_APP_TOKEN,
      apiVersion: process.env.MESSENGER_API_VERSION,
    },
    logger
  )
  messenger.onMessage(async (message) => {
    logger.info(`[Messenger] Incoming: ${JSON.stringify(message)}`)
    // TODO: Connect your NLP / chatbot logic here
  })
  logger.info('✅ Messenger channel initialized')
}

// HubSpot CRM
if (process.env.HUBSPOT_ACCESS_TOKEN) {
  hubspot = new HubSpotClient({ accessToken: process.env.HUBSPOT_ACCESS_TOKEN }, logger)
  logger.info('✅ HubSpot CRM client initialized')
}

// Google Sheets
if (
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GOOGLE_REFRESH_TOKEN &&
  process.env.GSHEETS_SPREADSHEET_ID
) {
  gsheets = new GSheetsClient(
    {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      spreadsheetId: process.env.GSHEETS_SPREADSHEET_ID,
    },
    logger
  )
  logger.info('✅ Google Sheets client initialized')
}

// Gmail
if (
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.GMAIL_REFRESH_TOKEN
) {
  gmail = new GmailEmailClient(
    {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    },
    logger
  )
  logger.info('✅ Gmail email client initialized')
}

// ── Express Server ──────────────────────────────────────────────

const app = express()

// Use raw body for signature verification, then parse JSON
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      // Store raw body for signature verification
      req.rawBody = buf.toString()
    },
  })
)

// Register webhook routes
const router = express.Router()
createWebhookRouter(router, { whatsapp, instagram, messenger, logger })
app.use(router)

// Root info endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'chatbot-integrations',
    description: 'Standalone chatbot integration layer extracted from Botpress',
    channels: {
      whatsapp: !!whatsapp,
      instagram: !!instagram,
      messenger: !!messenger,
    },
    services: {
      hubspot: !!hubspot,
      gsheets: !!gsheets,
      gmail: !!gmail,
    },
    nlp: {
      rasaUrl: RASA_URL,
    },
    endpoints: {
      health: '/health',
      whatsapp: whatsapp ? '/webhooks/whatsapp' : null,
      instagram: instagram ? '/webhooks/instagram' : null,
      messenger: messenger ? '/webhooks/messenger' : null,
    },
  })
})

// Health endpoint with NLP status
app.get('/health', async (_req, res) => {
  const nlpHealth = await nlpClient.healthCheck()
  res.json({
    server: 'ok',
    nlp: nlpHealth,
    channels: {
      instagram: !!instagram,
      whatsapp: !!whatsapp,
      messenger: !!messenger,
    },
  })
})

// ── Start ───────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info(`🚀 Chatbot integrations server running on port ${PORT}`)
  logger.info(`   Health check: http://localhost:${PORT}/health`)
})

// Export initialized clients for programmatic usage
export { whatsapp, instagram, messenger, hubspot, gsheets, gmail, app }
