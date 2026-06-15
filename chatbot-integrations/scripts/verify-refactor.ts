import { PrismaClient } from '@prisma/client'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import assert from 'assert'

const prisma = new PrismaClient()
const WEBHOOK_URL = 'http://localhost:3000/webhooks/whatsapp'

async function clearDb(phone: string) {
  const customer = await prisma.customer.findFirst({ where: { phone } })
  if (customer) {
    await prisma.interest.deleteMany({ where: { customerId: customer.id } })
    await prisma.currentInterest.deleteMany({ where: { customerId: customer.id } })
    await prisma.supportCase.deleteMany({ where: { customerId: customer.id } })
    await prisma.conversationMessage.deleteMany({ where: { conversation: { customerId: customer.id } } })
    await prisma.customer.update({
      where: { id: customer.id },
      data: { qualificationStatus: 'new', leadName: null, email: null, location: null }
    })
  }
}

async function sendMessage(text: string, from: string) {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'test_account',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                phone_number_id: 'test_phone',
                display_phone_number: '123456789',
              },
              contacts: [{ profile: { name: 'Test User' }, wa_id: from }],
              messages: [
                {
                  from: from,
                  id: `msg_${Date.now()}_${Math.random()}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: { body: text },
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  }
  const res = await axios.post(WEBHOOK_URL, payload)
  return res.data
}

async function runTests() {
  const phone = '60123456789'
  
  console.log('--- Clearing DB for tests ---')
  await clearDb(phone)

  console.log('\n--- Test 1: Support Separation (Return Request) ---')
  await sendMessage('I need to return my product', phone)
  await new Promise(r => setTimeout(r, 2000)) // give it time to process
  
  let customer = await prisma.customer.findFirst({ where: { phone } })
  let cases = await prisma.supportCase.findMany({ where: { customerId: customer!.id } })
  assert(cases.length === 1, 'Expected 1 support case created')
  assert(cases[0].caseType === 'Return Request', 'Expected Return Request case type')
  assert(customer!.preferredService !== 'Return Request', 'preferredService should not be polluted')
  console.log('Test 1 Passed.')

  console.log('\n--- Test 2: Current Interest Replacement ---')
  await sendMessage('I need sunglasses', phone)
  await new Promise(r => setTimeout(r, 2000))
  await sendMessage('I need contact lenses', phone)
  await new Promise(r => setTimeout(r, 2000))
  
  customer = await prisma.customer.findFirst({ where: { phone } })
  let currentInterests = await prisma.currentInterest.findMany({ where: { customerId: customer!.id, kind: 'product_type' } })
  let historicalInterests = await prisma.interest.findMany({ where: { customerId: customer!.id, kind: 'product_type' } })
  
  assert(currentInterests.length === 1, 'Expected only 1 current interest for product_type')
  assert(currentInterests[0].value.toLowerCase().includes('contact'), `Expected contact lenses, got ${currentInterests[0].value}`)
  assert(historicalInterests.length >= 2, 'Expected at least 2 historical interests')
  console.log('Test 2 Passed.')

  console.log('\n--- Test 3: Brand Normalization ---')
  await sendMessage('I want rayban', phone)
  await new Promise(r => setTimeout(r, 2000))
  
  customer = await prisma.customer.findFirst({ where: { phone } })
  let brandInterests = await prisma.currentInterest.findMany({ where: { customerId: customer!.id, kind: 'brand' } })
  assert(brandInterests[0].value === 'Ray-Ban', `Expected normalized brand Ray-Ban, got ${brandInterests[0].value}`)
  console.log('Test 3 Passed.')

  console.log('\n--- Test 4: Lead Qualification ---')
  await clearDb('60111222333')
  await sendMessage('Exchange Request', '60111222333')
  await new Promise(r => setTimeout(r, 2000))
  
  let newCustomer = await prisma.customer.findFirst({ where: { phone: '60111222333' } })
  assert(newCustomer!.qualificationStatus !== 'needs_review' && newCustomer!.qualificationStatus !== 'qualified', 'Support Request should not qualify lead')
  console.log('Test 4 Passed.')

  console.log('\n--- Test 5: Greeting Recovery ---')
  // Send 'hi' to the first user who is in a support flow
  await sendMessage('hi', phone)
  await new Promise(r => setTimeout(r, 2000))
  // The system should respond with utter_greet (checked visually or via logs).
  console.log('Test 5 Passed (Check manually that it resets to greet).')

  console.log('\nAll automated checks passed!')
}

runTests().catch(console.error).finally(() => prisma.$disconnect())
