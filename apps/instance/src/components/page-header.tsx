import { cn } from '@/lib/cn'

export interface PageHeaderProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'title'
> {
  title: React.ReactNode
  /** One line of orientation. Not a paragraph. */
  description?: React.ReactNode
  /** Small label above the title — the section this page belongs to. */
  eyebrow?: React.ReactNode
  /** Primary and secondary actions, right-aligned on wide viewports. */
  actions?: React.ReactNode
}

/**
 * The standard head of every operator page.
 *
 * Replaces the old pattern of an <Eyebrow> above a display-scale <h1>, which
 * spent a third of the viewport telling the reader the name of the page they
 * had just clicked. The title is a label; the data below it is the content.
 */
export function PageHeader({
  actions,
  className,
  description,
  eyebrow,
  title,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
      data-page-header=""
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="truncate">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

/**
 * A toolbar strip above a list: search and filters on the left, actions on
 * the right. Keeping every list's controls in the same place is most of what
 * makes a multi-module admin feel like one product.
 */
export function Toolbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-2 sm:flex-row sm:items-center',
        className,
      )}
      {...props}
    />
  )
}

export function ToolbarSpacer() {
  return <div className="hidden flex-1 sm:block" />
}
