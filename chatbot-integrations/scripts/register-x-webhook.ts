import axios from 'axios'
import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createOAuthHeader } from '../src/integrations/channels/x/oauth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const consumerKey = process.env.X_API_KEY!
const consumerSecret = process.env.X_API_SECRET!
const accessToken = process.env.X_ACCESS_TOKEN!
const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET!
const envName = process.argv[2] ?? 'dev'
const webhookUrl = process.argv[3]

if (!webhookUrl) {
  console.error('Usage: npx tsx scripts/register-x-webhook.ts <env_name> <webhook_url>')
  console.error('Example: npx tsx scripts/register-x-webhook.ts dev https://your-tunnel.trycloudflare.com/webhooks/x')
  process.exit(1)
}

async function main() {
  const baseUrl = 'https://api.x.com/1.1'

  // Step 1: List existing webhooks
  console.log(`\n📋 Listing existing webhooks for environment "${envName}"...`)
  try {
    const listUrl = `${baseUrl}/account_activity/all/${envName}/webhooks.json`
    const listAuth = createOAuthHeader({
      method: 'GET',
      url: listUrl,
      consumerKey, consumerSecret, accessToken, accessTokenSecret,
    })
    const listRes = await axios.get(listUrl, { headers: { Authorization: listAuth } })
    console.log('Existing webhooks:', JSON.stringify(listRes.data, null, 2))

    // Delete existing webhooks if any
    for (const wh of listRes.data ?? []) {
      console.log(`🗑️  Deleting existing webhook ${wh.id}...`)
      const delUrl = `${baseUrl}/account_activity/all/${envName}/webhooks/${wh.id}.json`
      const delAuth = createOAuthHeader({
        method: 'DELETE' as any,
        url: delUrl,
        consumerKey, consumerSecret, accessToken, accessTokenSecret,
      })
      await axios.delete(delUrl, { headers: { Authorization: delAuth } })
      console.log('   Deleted.')
    }
  } catch (err: any) {
    console.log('Could not list webhooks:', err.response?.data ?? err.message)
  }

  // Step 2: Register new webhook
  console.log(`\n🔗 Registering webhook: ${webhookUrl}`)
  const registerUrl = `${baseUrl}/account_activity/all/${envName}/webhooks.json`
  const queryParams = { url: webhookUrl }
  const registerAuth = createOAuthHeader({
    method: 'POST',
    url: registerUrl,
    consumerKey, consumerSecret, accessToken, accessTokenSecret,
    queryParams,
  })

  try {
    const res = await axios.post(`${registerUrl}?url=${encodeURIComponent(webhookUrl)}`, null, {
      headers: { Authorization: registerAuth },
    })
    console.log('✅ Webhook registered:', JSON.stringify(res.data, null, 2))
  } catch (err: any) {
    console.error('❌ Failed to register webhook:', JSON.stringify(err.response?.data ?? err.message, null, 2))
    process.exit(1)
  }

  // Step 3: Subscribe to user events
  console.log('\n📬 Subscribing to account activity...')
  const subUrl = `${baseUrl}/account_activity/all/${envName}/subscriptions.json`
  const subAuth = createOAuthHeader({
    method: 'POST',
    url: subUrl,
    consumerKey, consumerSecret, accessToken, accessTokenSecret,
  })

  try {
    await axios.post(subUrl, null, { headers: { Authorization: subAuth } })
    console.log('✅ Subscribed to user events (DMs, etc.)')
  } catch (err: any) {
    console.error('❌ Subscription failed:', JSON.stringify(err.response?.data ?? err.message, null, 2))
  }

  console.log('\n🎉 Done! X webhook setup complete.')
}

main().catch(console.error)
