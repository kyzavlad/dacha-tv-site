import Link from 'next/link'

interface Crumb {
  label: string
  href?: string
}

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href ?? crumb.label} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true">/</span>}
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-gray-700 transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-gray-600 font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
