import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { loadConfig } from '../config/index.js'
import { createWebhookRouter } from '../core/webhook/index.js'
import { ConsoleLogger, NLPClient, type Logger } from '../core/utils/index.js'
import { InstagramChannel } from '../integrations/channels/instagram/index.js'
import { MessengerChannel } from '../integrations/channels/messenger/index.js'
import { WhatsAppChannel } from '../integrations/channels/whatsapp/index.js'
import { HubSpotClient } from '../integrations/crm/hubspot/index.js'
import { createNlpMessageHandler } from './message-handler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const logger: Logger = new ConsoleLogger()
const config = loadConfig()

const nlpClient = new NLPClient({ rasaUrl: config.rasaUrl }, logger)
logger.info(`NLP client configured for ${config.rasaUrl}`)

let whatsapp: WhatsAppChannel | undefined
let instagram: InstagramChannel | undefined
let messenger: MessengerChannel | undefined
let hubspot: HubSpotClient | undefined

if (config.whatsapp) {
  whatsapp = new WhatsAppChannel(config.whatsapp, logger)
  whatsapp.onMessage(createNlpMessageHandler({
    channelName: 'WhatsApp',
    logger,
    nlpClient,
    sendText: (recipientId, text) => whatsapp!.sendMessage(recipientId, { type: 'text', text }),
  }))
  logger.info('WhatsApp channel enabled')
}

if (config.instagram) {
  instagram = new InstagramChannel(config.instagram, logger)
  instagram.onMessage(createNlpMessageHandler({
    channelName: 'Instagram',
    logger,
    nlpClient,
    sendText: (recipientId, text) => instagram!.sendTextMessage(recipientId, text),
  }))
  logger.info('Instagram channel enabled')
}

if (config.messenger) {
  messenger = new MessengerChannel(config.messenger, logger)
  messenger.onMessage(createNlpMessageHandler({
    channelName: 'Messenger',
    logger,
    nlpClient,
    sendText: (recipientId, text) => messenger!.sendText(recipientId, text),
  }))
  logger.info('Messenger channel enabled')
}

if (config.hubspot) {
  hubspot = new HubSpotClient(config.hubspot, logger)
  logger.info('HubSpot client enabled')
}

const app = express()

app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString()
  },
}))

const router = express.Router()
createWebhookRouter(router, { whatsapp, instagram, messenger, logger })
app.use(router)

app.get('/', (_req, res) => {
  res.json({
    name: 'chatbot-integrations',
    channels: {
      whatsapp: Boolean(whatsapp),
      instagram: Boolean(instagram),
      messenger: Boolean(messenger),
    },
    services: {
      hubspot: Boolean(hubspot),
    },
    nlp: {
      rasaUrl: config.rasaUrl,
    },
    endpoints: {
      health: '/health',
      whatsapp: whatsapp ? '/webhooks/whatsapp' : null,
      instagram: instagram ? '/webhooks/instagram' : null,
      messenger: messenger ? '/webhooks/messenger' : null,
    },
  })
})

app.get('/health', async (_req, res) => {
  const nlpHealth = await nlpClient.healthCheck()
  res.json({
    server: 'ok',
    nlp: nlpHealth,
    channels: {
      whatsapp: Boolean(whatsapp),
      instagram: Boolean(instagram),
      messenger: Boolean(messenger),
    },
  })
})

app.listen(config.port, () => {
  logger.info(`Chatbot integrations server running on port ${config.port}`)
})

export { app, hubspot, instagram, messenger, whatsapp }
