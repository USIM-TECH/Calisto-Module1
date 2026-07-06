import { createApp } from './create-app.js'
import { createDependencies } from './dependencies.js'
import { disconnectRedis } from '../cache/index.js'

async function main() {
  const dependencies = await createDependencies()
  const { config, logger, channelAccountService, x, hubspot } = dependencies
  const app = createApp(dependencies)
  const server = app.listen(config.port, () => {
    logger.info(`Chatbot integrations server running on port ${config.port}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(
        `Port ${config.port} is already in use (EADDRINUSE). ` +
          `Stop the other process using that port or set PORT in chatbot-integrations/.env. ` +
          `Hint: ss -tlnp | grep ':${config.port}'  or  fuser -k ${config.port}/tcp`,
      )
    } else {
      logger.error(`HTTP server failed to start: ${err.message}`)
    }
    process.exit(1)
  })

  function shutdown(signal: string) {
    logger.info(`Received ${signal}, shutting down HTTP server`)
    server.close(async (error?: Error) => {
      if (error) {
        logger.error(`HTTP server shutdown failed: ${error.message}`)
        process.exit(1)
      }
      await disconnectRedis()
      process.exit(0)
    })

    setTimeout(() => {
      logger.error('Forced shutdown after timeout')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  return { app, hubspot, channelAccountService, server, x }
}

const boot = main()

export { boot as app }
