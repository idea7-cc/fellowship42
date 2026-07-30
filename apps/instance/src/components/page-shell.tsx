import { cn } from '@/lib/cn'

interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Extra bottom padding for portal / dashboard views */
  padBottom?: boolean
  /**
   * `default` fills the working area — right for tables and dashboards.
   * `narrow` caps the measure for reading-heavy pages such as settings.
   */
  width?: 'default' | 'narrow'
}

export function PageShell({
  children,
  className,
  padBottom,
  width = 'default',
  ...props
}: PageShellProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-6 sm:px-6',
        width === 'narrow' ? 'max-w-3xl' : 'max-w-[1400px]',
        padBottom ? 'pb-16' : 'pb-10',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
