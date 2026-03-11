import {
  DEFAULT_COMPANY_PROPERTIES,
  type HubSpotClientContext,
} from './shared.js'

export async function searchCompany(
  { hsClient, logger }: HubSpotClientContext,
  {
    name,
    domain,
    propertiesToReturn,
  }: {
    name?: string
    domain?: string
    propertiesToReturn?: string[]
  }
) {
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

  const companies = await hsClient.crm.companies.searchApi.doSearch({
    filterGroups: [{ filters }],
    properties: [...DEFAULT_COMPANY_PROPERTIES, ...(propertiesToReturn ?? [])],
  })

  const company = companies.results[0]
  if (!company) {
    logger.debug(`No company found for name=${name}, domain=${domain}`)
    return undefined
  }
  return company
}

export async function getCompany(
  { hsClient }: HubSpotClientContext,
  { companyId, propertiesToReturn }: { companyId: string; propertiesToReturn?: string[] }
) {
  return hsClient.crm.companies.basicApi.getById(
    companyId,
    [...DEFAULT_COMPANY_PROPERTIES, ...(propertiesToReturn ?? [])]
  )
}

export async function updateCompany(
  { hsClient }: HubSpotClientContext,
  {
    companyId,
    additionalProperties,
  }: {
    companyId: string
    additionalProperties: Record<string, string>
  }
) {
  return hsClient.crm.companies.basicApi.update(companyId, {
    properties: additionalProperties,
  })
}
