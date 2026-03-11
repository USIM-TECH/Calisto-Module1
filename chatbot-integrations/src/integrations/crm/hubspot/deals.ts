import {
  DEFAULT_DEAL_PROPERTIES,
  type HubSpotClientContext,
} from './shared.js'

export async function searchDeal(
  { hsClient, logger }: HubSpotClientContext,
  {
    dealName,
    propertiesToReturn,
  }: {
    dealName: string
    propertiesToReturn?: string[]
  }
) {
  const deals = await hsClient.crm.deals.searchApi.doSearch({
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
    logger.debug(`No deal found for name=${dealName}`)
    return undefined
  }
  return deal
}

export async function getDeal(
  { hsClient }: HubSpotClientContext,
  { dealId, propertiesToReturn }: { dealId: string; propertiesToReturn?: string[] }
) {
  return hsClient.crm.deals.basicApi.getById(
    dealId,
    [...DEFAULT_DEAL_PROPERTIES, ...(propertiesToReturn ?? [])]
  )
}

export async function createDeal(
  { hsClient }: HubSpotClientContext,
  {
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
  }
) {
  return hsClient.crm.deals.basicApi.create({
    properties: {
      ...(additionalProperties ?? {}),
      dealname: dealName,
      ...(pipeline ? { pipeline } : {}),
      ...(dealStage ? { dealstage: dealStage } : {}),
      ...(amount ? { amount } : {}),
    },
    associations: [],
  })
}

export async function updateDeal(
  { hsClient }: HubSpotClientContext,
  {
    dealId,
    additionalProperties,
  }: {
    dealId: string
    additionalProperties: Record<string, string>
  }
) {
  return hsClient.crm.deals.basicApi.update(dealId, {
    properties: additionalProperties,
  })
}

export async function deleteDeal(
  { hsClient }: HubSpotClientContext,
  { dealId }: { dealId: string }
) {
  await hsClient.crm.deals.basicApi.archive(dealId)
}
