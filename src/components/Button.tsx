import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-action text-white hover:bg-action-hover active:bg-action-press disabled:bg-action/40 disabled:text-white/60',
  secondary: 'bg-raised text-ink border border-line-strong hover:border-[#4a5f7d] hover:bg-[#1c2a42] active:bg-[#14203a] disabled:text-faint',
  ghost: 'text-muted hover:text-ink hover:bg-raised active:bg-sunken disabled:text-faint',
  danger: 'bg-danger text-[#1a0a0b] hover:bg-[#ee7d76] active:bg-[#d5554d] disabled:opacity-50',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'md' | 'sm'
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', icon, className = '', children, type = 'button', ...rest }: Props) {
  const sizing = size === 'md' ? 'min-h-11 px-4 text-[15px] gap-2' : 'min-h-11 sm:min-h-9 px-3 text-sm gap-1.5'
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-[background-color,border-color,color] duration-150 disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
