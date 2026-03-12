import {
  DEFAULT_LEAD_PROPERTIES,
  type HubSpotClientContext,
} from './shared.js'

export async function createLead(
  { hsClient }: HubSpotClientContext,
  {
    leadName,
    additionalProperties,
  }: {
    leadName: string
    additionalProperties?: Record<string, string>
  }
) {
  return (hsClient.crm as any).objects.leads.basicApi.create({
    properties: {
      ...(additionalProperties ?? {}),
      hs_lead_name: leadName,
    },
    associations: [],
  })
}

export async function getLead(
  { hsClient }: HubSpotClientContext,
  { leadId, propertiesToReturn }: { leadId: string; propertiesToReturn?: string[] }
) {
  return (hsClient.crm as any).objects.leads.basicApi.getById(
    leadId,
    [...DEFAULT_LEAD_PROPERTIES, ...(propertiesToReturn ?? [])]
  )
}

export async function updateLead(
  { hsClient }: HubSpotClientContext,
  {
    leadId,
    additionalProperties,
  }: {
    leadId: string
    additionalProperties: Record<string, string>
  }
) {
  return (hsClient.crm as any).objects.leads.basicApi.update(leadId, {
    properties: additionalProperties,
  })
}

export async function deleteLead(
  { hsClient }: HubSpotClientContext,
  { leadId }: { leadId: string }
) {
  await (hsClient.crm as any).objects.leads.basicApi.archive(leadId)
}
