import { cn } from '@/lib/cn'

interface PageShellProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Extra bottom padding for portal / dashboard views */
  padBottom?: boolean
}

export function PageShell({ children, className, padBottom, ...props }: PageShellProps) {
  return (
    <div
      className={cn('mx-auto max-w-[1200px] px-5 py-8 pb-16', padBottom && 'pb-20', className)}
      {...props}
    >
      {children}
    </div>
  )
}
