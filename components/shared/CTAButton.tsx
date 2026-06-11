import Link from 'next/link'
import { cn } from '@/lib/utils'

interface CTAButtonProps {
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'outline' | 'white' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  className?: string
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  fullWidth?: boolean
}

const variants = {
  primary: 'bg-honey-700 text-white hover:bg-honey-800 focus:ring-honey-600',
  secondary: 'bg-bark text-white hover:bg-bark-light focus:ring-bark',
  outline: 'border-2 border-honey-700 text-honey-700 hover:bg-honey-50 focus:ring-honey-600',
  white: 'bg-white text-bark hover:bg-honey-50 focus:ring-white border-2 border-white/30',
  ghost: 'text-bark/70 hover:text-bark hover:bg-honey-50 focus:ring-honey-600',
}

const sizes = {
  sm: 'px-5 py-2.5 text-sm min-h-[40px]',
  md: 'px-7 py-3.5 text-base min-h-[48px]',
  lg: 'px-9 py-4 text-lg min-h-[56px]',
}

export function CTAButton({
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  children,
  className,
  type = 'button',
  disabled,
  fullWidth,
}: CTAButtonProps) {
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold',
    'transition-all focus:outline-none focus:ring-2 focus:ring-offset-2',
    'disabled:opacity-60 disabled:cursor-not-allowed',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
    className
  )

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  )
}
