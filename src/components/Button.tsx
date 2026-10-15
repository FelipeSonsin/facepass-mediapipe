import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-action text-white hover:bg-action-hover active:bg-action-press disabled:bg-action/40 disabled:text-white/60',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-muted hover:bg-raised active:bg-line disabled:text-faint',
  ghost: 'text-muted hover:text-ink hover:bg-raised active:bg-sunken disabled:text-faint',
  danger: 'bg-danger text-white hover:bg-[#a62c2c] active:bg-[#922727] disabled:opacity-50',
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
