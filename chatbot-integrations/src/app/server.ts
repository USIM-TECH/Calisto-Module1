import { createApp } from './create-app.js'
import { createDependencies } from './dependencies.js'

const dependencies = createDependencies()
const { config, logger, whatsapp, instagram, messenger, telegram, x, hubspot } = dependencies
const app = createApp(dependencies)
const server = app.listen(config.port, () => {
  logger.info(`Chatbot integrations server running on port ${config.port}`)
})

function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down HTTP server`)
  server.close((error?: Error) => {
    if (error) {
      logger.error(`HTTP server shutdown failed: ${error.message}`)
      process.exit(1)
    }
    process.exit(0)
  })

  setTimeout(() => {
    logger.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export { app, hubspot, instagram, messenger, server, telegram, whatsapp, x }
