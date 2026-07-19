import { cn } from '@/lib/cn'

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Section title */
  title?: string
  /** Section description */
  description?: string
}

export function Section({ children, className, description, title, ...props }: SectionProps) {
  return (
    <section className={cn('mt-12', className)} {...props}>
      {(title || description) && (
        <div className="mb-6 grid gap-2">
          {title && <h2>{title}</h2>}
          {description && <p>{description}</p>}
        </div>
      )}
      {children}
    </section>
  )
}
