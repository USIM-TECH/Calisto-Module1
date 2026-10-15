import Select from './Select'
import type { ResponseMode } from '../types'

const OPTIONS: Array<{ value: ResponseMode; label: string }> = [
  { value: 'payload', label: 'Payload' },
  { value: 'chat', label: 'Chat' },
]

export const RESPONSE_MODE_HELP: Record<ResponseMode, string> = {
  payload: 'Guided flow: buttons, quick replies and forms.',
  chat: 'Free-text assistant that answers from Calisto products and knowledge.',
}

interface ResponseModeSelectProps {
  value: ResponseMode
  onChange: (mode: ResponseMode) => void
  disabled?: boolean
  /** Smaller, content-width control for table cells; the default fills its container. */
  compact?: boolean
  'aria-label': string
}

/** How the bot answers on a channel: guided payload flow or free-text chat. */
export default function ResponseModeSelect({ value, onChange, disabled, compact = false, 'aria-label': ariaLabel }: ResponseModeSelectProps) {
  return (
    <Select
      aria-label={ariaLabel}
      className={compact ? '!h-9 !gap-2 !rounded-full !px-3 !text-xs !font-semibold' : ''}
      disabled={disabled}
      fullWidth={!compact}
      onChange={(next) => onChange(next as ResponseMode)}
      options={OPTIONS}
      value={value}
    />
  )
}
