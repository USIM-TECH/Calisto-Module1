import {
  DEFAULT_CONTACT_PROPERTIES,
  type HubSpotClientContext,
} from './shared.js'

export async function searchContact(
  { hsClient, logger }: HubSpotClientContext,
  {
    email,
    phone,
    propertiesToReturn,
  }: {
    email?: string
    phone?: string
    propertiesToReturn?: string[]
  }
) {
  const filters: any[] = []

  if (phone) {
    filters.push({ propertyName: 'phone', operator: 'EQ', value: phone.trim() })
  }
  if (email) {
    filters.push({ propertyName: 'email', operator: 'EQ', value: email.trim() })
  }
  if (!filters.length) {
    throw new Error('Missing required filters: phone and/or email')
  }

  const contacts = await hsClient.crm.contacts.searchApi.doSearch({
    filterGroups: [{ filters }],
    properties: [...DEFAULT_CONTACT_PROPERTIES, ...(propertiesToReturn ?? [])],
  })

  const contact = contacts.results[0]
  if (!contact) {
    logger.debug(`No contact found for email=${email}, phone=${phone}`)
    return undefined
  }
  return contact
}

export async function getContact(
  { hsClient }: HubSpotClientContext,
  { contactId, propertiesToReturn }: { contactId: string; propertiesToReturn?: string[] }
) {
  const idProperty = contactId.includes('@') ? 'email' : undefined
  return hsClient.crm.contacts.basicApi.getById(
    contactId,
    [...DEFAULT_CONTACT_PROPERTIES, ...(propertiesToReturn ?? [])],
    undefined,
    undefined,
    undefined,
    idProperty
  )
}

export async function createContact(
  { hsClient }: HubSpotClientContext,
  {
    email,
    phone,
    additionalProperties,
  }: {
    email?: string
    phone?: string
    additionalProperties?: Record<string, string>
  }
) {
  if (!email && !phone) {
    throw new Error('Email or phone is required to create a contact')
  }

  return hsClient.crm.contacts.basicApi.create({
    properties: {
      ...(additionalProperties ?? {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    },
    associations: [],
  })
}

export async function updateContact(
  { hsClient }: HubSpotClientContext,
  {
    contactId,
    email,
    phone,
    additionalProperties,
  }: {
    contactId: string
    email?: string
    phone?: string
    additionalProperties?: Record<string, string>
  }
) {
  const idProperty = contactId.includes('@') ? 'email' : undefined
  return hsClient.crm.contacts.basicApi.update(
    contactId,
    {
      properties: {
        ...(additionalProperties ?? {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      },
    },
    idProperty
  )
}

export async function deleteContact(
  { hsClient }: HubSpotClientContext,
  { contactId }: { contactId: string }
) {
  await hsClient.crm.contacts.basicApi.archive(contactId)
}

export async function listContacts(
  { hsClient }: HubSpotClientContext,
  { limit, after }: { limit?: number; after?: string } = {}
) {
  return hsClient.crm.contacts.basicApi.getPage(
    limit ?? 100,
    after,
    DEFAULT_CONTACT_PROPERTIES
  )
}
