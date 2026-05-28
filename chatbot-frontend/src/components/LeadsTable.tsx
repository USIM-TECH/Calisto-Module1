import { Mail, MessageCircle } from 'lucide-react'
import type { ChannelIdentityRecord, CustomerRecord } from '../types'
import ChannelBadge from './ChannelBadge'
import StatusBadge from './StatusBadge'

interface LeadsTableProps {
  customers: CustomerRecord[]
  identitiesByCustomer: Map<string, ChannelIdentityRecord[]>
}

function buildWhatsappLink(phone?: string) {
  if (!phone) return undefined
  const digits = phone.replace(/[^\d]/g, '')
  return digits ? `https://wa.me/${digits}` : undefined
}

function customerName(customer: CustomerRecord) {
  return customer.leadName ?? customer.email ?? customer.phone ?? 'Unknown Customer'
}

function customerInitials(customer: CustomerRecord) {
  return customerName(customer)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

export function getCustomerName(customer: CustomerRecord) {
  return customerName(customer)
}

export default function LeadsTable({ customers, identitiesByCustomer }: LeadsTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-dashboard">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-100/90 text-xs font-bold uppercase tracking-wider text-calisto-ink">
              <th className="px-7 py-5">Customer</th>
              <th className="px-7 py-5">Identity / Channel</th>
              <th className="px-7 py-5">Intent</th>
              <th className="px-7 py-5">Status</th>
              <th className="px-7 py-5">Contact</th>
              <th className="px-7 py-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {customers.length === 0 && (
              <tr>
                <td className="px-7 py-12 text-center text-sm font-medium text-slate-500" colSpan={6}>
                  No customers match these filters.
                </td>
              </tr>
            )}

            {customers.map((customer) => {
              const identities = identitiesByCustomer.get(customer.id) ?? []
              const whatsappLink = buildWhatsappLink(customer.phone)
              const reviewUrl = `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'}/reports/leads-dashboard/${customer.id}`

              return (
                <tr key={customer.id} className="transition hover:bg-slate-50">
                  <td className="px-7 py-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                        {customerInitials(customer)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-800">{customerName(customer)}</div>
                        <div className="truncate text-xs text-slate-500">{customer.location ?? 'No location'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-7 py-4">
                    <div className="flex max-w-xs flex-wrap gap-2">
                      {identities.length > 0 ? (
                        identities.slice(0, 2).map((identity) => <ChannelBadge identity={identity} key={identity.id} />)
                      ) : (
                        <span className="text-xs text-slate-400">No channel identity</span>
                      )}
                    </div>
                  </td>
                  <td className="px-7 py-4 text-slate-600">{customer.lastIntent ?? customer.preferredService ?? 'Return Request'}</td>
                  <td className="px-7 py-4"><StatusBadge status={customer.qualificationStatus} /></td>
                  <td className="px-7 py-4">
                    <div className="flex items-center gap-2">
                      {whatsappLink && (
                        <a
                          aria-label={`WhatsApp ${customerName(customer)}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-100 bg-white text-emerald-600 transition hover:bg-emerald-50"
                          href={whatsappLink}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      )}
                      {customer.email && (
                        <a
                          aria-label={`Email ${customerName(customer)}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-white text-blue-700 transition hover:bg-blue-50"
                          href={`mailto:${customer.email}`}
                        >
                          <Mail className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-7 py-4 text-right">
                    <a
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-orange-100 bg-white px-4 text-sm font-semibold text-calisto-accent transition hover:bg-orange-50"
                      href={reviewUrl}
                    >
                      Review Lead
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
