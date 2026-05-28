import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  variant?: ButtonVariant
}

const variants: Record<ButtonVariant, string> = {
  primary: 'border-calisto-accent bg-calisto-accent text-white shadow-sm hover:bg-orange-700',
  secondary: 'border-slate-200 bg-white text-calisto-ink hover:bg-slate-50',
  ghost: 'border-transparent bg-transparent text-calisto-accent hover:bg-orange-50',
}

export default function Button({
  children,
  className = '',
  icon,
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}
