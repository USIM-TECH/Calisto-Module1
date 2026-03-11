import { Client as OfficialHubspotClient } from '@hubspot/api-client'
import type { Logger } from '../../../core/utils/index.js'
import {
  createContact,
  deleteContact,
  getContact,
  listContacts,
  searchContact,
  updateContact,
} from './contacts.js'
import {
  getCompany,
  searchCompany,
  updateCompany,
} from './companies.js'
import {
  createDeal,
  deleteDeal,
  getDeal,
  searchDeal,
  updateDeal,
} from './deals.js'
import {
  createLead,
  deleteLead,
  getLead,
  updateLead,
} from './leads.js'
import type { HubSpotClientContext } from './shared.js'

export interface HubSpotConfig {
  accessToken: string
}

export class HubSpotClient {
  private readonly _context: HubSpotClientContext

  constructor(config: HubSpotConfig, logger: Logger) {
    this._context = {
      logger,
      hsClient: new OfficialHubspotClient({
        accessToken: config.accessToken,
        numberOfApiCallRetries: 2,
      }),
    }
  }

  public async searchContact(args: Parameters<typeof searchContact>[1]) {
    return searchContact(this._context, args)
  }

  public async getContact(args: Parameters<typeof getContact>[1]) {
    return getContact(this._context, args)
  }

  public async createContact(args: Parameters<typeof createContact>[1]) {
    return createContact(this._context, args)
  }

  public async updateContact(args: Parameters<typeof updateContact>[1]) {
    return updateContact(this._context, args)
  }

  public async deleteContact(args: Parameters<typeof deleteContact>[1]) {
    return deleteContact(this._context, args)
  }

  public async listContacts(args?: Parameters<typeof listContacts>[1]) {
    return listContacts(this._context, args)
  }

  public async searchCompany(args: Parameters<typeof searchCompany>[1]) {
    return searchCompany(this._context, args)
  }

  public async getCompany(args: Parameters<typeof getCompany>[1]) {
    return getCompany(this._context, args)
  }

  public async updateCompany(args: Parameters<typeof updateCompany>[1]) {
    return updateCompany(this._context, args)
  }

  public async searchDeal(args: Parameters<typeof searchDeal>[1]) {
    return searchDeal(this._context, args)
  }

  public async getDeal(args: Parameters<typeof getDeal>[1]) {
    return getDeal(this._context, args)
  }

  public async createDeal(args: Parameters<typeof createDeal>[1]) {
    return createDeal(this._context, args)
  }

  public async updateDeal(args: Parameters<typeof updateDeal>[1]) {
    return updateDeal(this._context, args)
  }

  public async deleteDeal(args: Parameters<typeof deleteDeal>[1]) {
    return deleteDeal(this._context, args)
  }

  public async createLead(args: Parameters<typeof createLead>[1]) {
    return createLead(this._context, args)
  }

  public async getLead(args: Parameters<typeof getLead>[1]) {
    return getLead(this._context, args)
  }

  public async updateLead(args: Parameters<typeof updateLead>[1]) {
    return updateLead(this._context, args)
  }

  public async deleteLead(args: Parameters<typeof deleteLead>[1]) {
    return deleteLead(this._context, args)
  }

  public async getHubId(): Promise<string> {
    const { hubId } = await this._context.hsClient.oauth.accessTokensApi.get(
      (this._context.hsClient as any)._config?.accessToken ?? ''
    )
    return hubId.toString()
  }
}
