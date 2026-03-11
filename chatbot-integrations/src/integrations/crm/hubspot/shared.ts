import type { Client as OfficialHubspotClient } from '@hubspot/api-client'
import type { Logger } from '../../../core/utils/index.js'

export const DEFAULT_CONTACT_PROPERTIES = ['createdate', 'email', 'firstname', 'lastmodifieddate', 'lastname', 'phone']
export const DEFAULT_COMPANY_PROPERTIES = ['createdate', 'domain', 'name', 'hs_lastmodifieddate', 'phone']
export const DEFAULT_DEAL_PROPERTIES = [
  'dealname', 'pipeline', 'dealstage', 'closedate', 'amount',
  'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate',
]
export const DEFAULT_LEAD_PROPERTIES = [
  'hs_lead_name', 'hs_pipeline_stage', 'hs_createdate', 'hs_lastmodifieddate',
  'hs_object_id', 'hs_pipeline',
]

export interface HubSpotClientContext {
  hsClient: OfficialHubspotClient
  logger: Logger
}
