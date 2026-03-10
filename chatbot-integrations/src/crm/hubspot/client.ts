import { Client as OfficialHubspotClient } from '@hubspot/api-client'
import type { Logger } from '../../utils/index.js'

const DEFAULT_CONTACT_PROPERTIES = ['createdate', 'email', 'firstname', 'lastmodifieddate', 'lastname', 'phone']
const DEFAULT_COMPANY_PROPERTIES = ['createdate', 'domain', 'name', 'hs_lastmodifieddate', 'phone']
const DEFAULT_DEAL_PROPERTIES = [
  'dealname', 'pipeline', 'dealstage', 'closedate', 'amount',
  'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate',
]
const DEFAULT_LEAD_PROPERTIES = [
  'hs_lead_name', 'hs_pipeline_stage', 'hs_createdate', 'hs_lastmodifieddate',
  'hs_object_id', 'hs_pipeline',
]

export interface HubSpotConfig {
  accessToken: string
}

/**
 * HubSpot CRM Client.
 * Extracted from Botpress HubSpot integration with Botpress SDK dependencies removed.
 * Wraps the official @hubspot/api-client for contacts, companies, deals, and leads.
 */
export class HubSpotClient {
  private readonly _hsClient: OfficialHubspotClient
  private readonly _logger: Logger

  constructor(config: HubSpotConfig, logger: Logger) {
    this._logger = logger
    this._hsClient = new OfficialHubspotClient({
      accessToken: config.accessToken,
      numberOfApiCallRetries: 2,
    })
  }

  // ── Contacts ──────────────────────────────────────────────────────

  /** Search for a contact by email and/or phone */
  public async searchContact({
    email,
    phone,
    propertiesToReturn,
  }: {
    email?: string
    phone?: string
    propertiesToReturn?: string[]
  }) {
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

    const contacts = await this._hsClient.crm.contacts.searchApi.doSearch({
      filterGroups: [{ filters }],
      properties: [...DEFAULT_CONTACT_PROPERTIES, ...(propertiesToReturn ?? [])],
    })

    const contact = contacts.results[0]
    if (!contact) {
      this._logger.debug(`No contact found for email=${email}, phone=${phone}`)
      return undefined
    }
    return contact
  }

  /** Get a contact by ID (numeric or email) */
  public async getContact({ contactId, propertiesToReturn }: { contactId: string; propertiesToReturn?: string[] }) {
    const idProperty = contactId.includes('@') ? 'email' : undefined
    const contact = await this._hsClient.crm.contacts.basicApi.getById(
      contactId,
      [...DEFAULT_CONTACT_PROPERTIES, ...(propertiesToReturn ?? [])],
      undefined,
      undefined,
      undefined,
      idProperty
    )
    return contact
  }

  /** Create a new contact */
  public async createContact({
    email,
    phone,
    additionalProperties,
  }: {
    email?: string
    phone?: string
    additionalProperties?: Record<string, string>
  }) {
    if (!email && !phone) {
      throw new Error('Email or phone is required to create a contact')
    }

    const newContact = await this._hsClient.crm.contacts.basicApi.create({
      properties: {
        ...(additionalProperties ?? {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      },
      associations: [],
    })
    return newContact
  }

  /** Update an existing contact */
  public async updateContact({
    contactId,
    email,
    phone,
    additionalProperties,
  }: {
    contactId: string
    email?: string
    phone?: string
    additionalProperties?: Record<string, string>
  }) {
    const idProperty = contactId.includes('@') ? 'email' : undefined
    const updatedContact = await this._hsClient.crm.contacts.basicApi.update(
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
    return updatedContact
  }

  /** Delete a contact */
  public async deleteContact({ contactId }: { contactId: string }) {
    await this._hsClient.crm.contacts.basicApi.archive(contactId)
  }

  /** List contacts with pagination */
  public async listContacts({ limit, after }: { limit?: number; after?: string } = {}) {
    const contacts = await this._hsClient.crm.contacts.basicApi.getPage(
      limit ?? 100,
      after,
      DEFAULT_CONTACT_PROPERTIES
    )
    return contacts
  }

  // ── Companies ─────────────────────────────────────────────────────

  /** Search for a company by name and/or domain */
  public async searchCompany({
    name,
    domain,
    propertiesToReturn,
  }: {
    name?: string
    domain?: string
    propertiesToReturn?: string[]
  }) {
    const filters: any[] = []

    if (name) {
      filters.push({ propertyName: 'name', operator: 'EQ', value: name.trim() })
    }
    if (domain) {
      filters.push({ propertyName: 'domain', operator: 'EQ', value: domain.trim() })
    }
    if (!filters.length) {
      throw new Error('Missing required filters: name and/or domain')
    }

    const companies = await this._hsClient.crm.companies.searchApi.doSearch({
      filterGroups: [{ filters }],
      properties: [...DEFAULT_COMPANY_PROPERTIES, ...(propertiesToReturn ?? [])],
    })

    const company = companies.results[0]
    if (!company) {
      this._logger.debug(`No company found for name=${name}, domain=${domain}`)
      return undefined
    }
    return company
  }

  /** Get a company by ID */
  public async getCompany({ companyId, propertiesToReturn }: { companyId: string; propertiesToReturn?: string[] }) {
    const company = await this._hsClient.crm.companies.basicApi.getById(
      companyId,
      [...DEFAULT_COMPANY_PROPERTIES, ...(propertiesToReturn ?? [])]
    )
    return company
  }

  /** Update a company */
  public async updateCompany({
    companyId,
    additionalProperties,
  }: {
    companyId: string
    additionalProperties: Record<string, string>
  }) {
    const updated = await this._hsClient.crm.companies.basicApi.update(companyId, {
      properties: additionalProperties,
    })
    return updated
  }

  // ── Deals ─────────────────────────────────────────────────────────

  /** Search for a deal by name */
  public async searchDeal({
    dealName,
    propertiesToReturn,
  }: {
    dealName: string
    propertiesToReturn?: string[]
  }) {
    const deals = await this._hsClient.crm.deals.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'dealname',
              operator: 'EQ' as any,
              value: dealName.trim(),
            },
          ],
        },
      ],
      properties: [...DEFAULT_DEAL_PROPERTIES, ...(propertiesToReturn ?? [])],
    })

    const deal = deals.results[0]
    if (!deal) {
      this._logger.debug(`No deal found for name=${dealName}`)
      return undefined
    }
    return deal
  }

  /** Get a deal by ID */
  public async getDeal({ dealId, propertiesToReturn }: { dealId: string; propertiesToReturn?: string[] }) {
    const deal = await this._hsClient.crm.deals.basicApi.getById(
      dealId,
      [...DEFAULT_DEAL_PROPERTIES, ...(propertiesToReturn ?? [])]
    )
    return deal
  }

  /** Create a new deal */
  public async createDeal({
    dealName,
    pipeline,
    dealStage,
    amount,
    additionalProperties,
  }: {
    dealName: string
    pipeline?: string
    dealStage?: string
    amount?: string
    additionalProperties?: Record<string, string>
  }) {
    const newDeal = await this._hsClient.crm.deals.basicApi.create({
      properties: {
        ...(additionalProperties ?? {}),
        dealname: dealName,
        ...(pipeline ? { pipeline } : {}),
        ...(dealStage ? { dealstage: dealStage } : {}),
        ...(amount ? { amount } : {}),
      },
      associations: [],
    })
    return newDeal
  }

  /** Update a deal */
  public async updateDeal({
    dealId,
    additionalProperties,
  }: {
    dealId: string
    additionalProperties: Record<string, string>
  }) {
    const updated = await this._hsClient.crm.deals.basicApi.update(dealId, {
      properties: additionalProperties,
    })
    return updated
  }

  /** Delete a deal */
  public async deleteDeal({ dealId }: { dealId: string }) {
    await this._hsClient.crm.deals.basicApi.archive(dealId)
  }

  // ── Leads (via objects/leads API) ─────────────────────────────────

  /** Create a lead */
  public async createLead({
    leadName,
    additionalProperties,
  }: {
    leadName: string
    additionalProperties?: Record<string, string>
  }) {
    const newLead = await (this._hsClient.crm as any).objects.leads.basicApi.create({
      properties: {
        ...(additionalProperties ?? {}),
        hs_lead_name: leadName,
      },
      associations: [],
    })
    return newLead
  }

  /** Get a lead by ID */
  public async getLead({ leadId, propertiesToReturn }: { leadId: string; propertiesToReturn?: string[] }) {
    const lead = await (this._hsClient.crm as any).objects.leads.basicApi.getById(
      leadId,
      [...DEFAULT_LEAD_PROPERTIES, ...(propertiesToReturn ?? [])]
    )
    return lead
  }

  /** Update a lead */
  public async updateLead({
    leadId,
    additionalProperties,
  }: {
    leadId: string
    additionalProperties: Record<string, string>
  }) {
    const updated = await (this._hsClient.crm as any).objects.leads.basicApi.update(leadId, {
      properties: additionalProperties,
    })
    return updated
  }

  /** Delete a lead */
  public async deleteLead({ leadId }: { leadId: string }) {
    await (this._hsClient.crm as any).objects.leads.basicApi.archive(leadId)
  }

  // ── Generic Helpers ───────────────────────────────────────────────

  /** Get the hub ID associated with the access token */
  public async getHubId(): Promise<string> {
    const { hubId } = await this._hsClient.oauth.accessTokensApi.get(
      (this._hsClient as any)._config?.accessToken ?? ''
    )
    return hubId.toString()
  }
}
