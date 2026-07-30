import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * The table is the centre of an operator tool. A directory of two thousand
 * people has to be scannable, aligned, and printable — a grid of cards is
 * none of those things.
 *
 * Composition:
 *   <TableContainer>            border, radius, horizontal scroll
 *     <Table>
 *       <TableHeader>           sunken, sticky, quiet
 *       <TableBody>             row separators, hover
 *
 * Numeric cells should carry `align="right"`; the base layer already applies
 * tabular figures to every table so columns of money line up.
 */

const TableContainer = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        'relative w-full overflow-x-auto rounded-lg border border-border bg-card',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
TableContainer.displayName = 'TableContainer'

const Table = React.forwardRef<HTMLTableElement, React.ComponentProps<'table'>>(
  ({ className, ...props }, ref) => (
    <table
      className={cn('w-full caption-bottom border-collapse text-sm', className)}
      ref={ref}
      {...props}
    />
  ),
)
Table.displayName = 'Table'

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.ComponentProps<'thead'>>(
  ({ className, ...props }, ref) => (
    <thead
      className={cn('sticky top-0 z-10 bg-surface-sunken [&_tr]:border-b [&_tr]:border-border', className)}
      ref={ref}
      {...props}
    />
  ),
)
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<HTMLTableSectionElement, React.ComponentProps<'tbody'>>(
  ({ className, ...props }, ref) => (
    <tbody
      className={cn('[&_tr:last-child]:border-0', className)}
      ref={ref}
      {...props}
    />
  ),
)
TableBody.displayName = 'TableBody'

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.ComponentProps<'tfoot'>>(
  ({ className, ...props }, ref) => (
    <tfoot
      className={cn('border-t border-border bg-surface-sunken font-medium', className)}
      ref={ref}
      {...props}
    />
  ),
)
TableFooter.displayName = 'TableFooter'

export interface TableRowProps extends React.ComponentProps<'tr'> {
  selected?: boolean
  /** Adds hover feedback for rows that navigate or open a record. */
  interactive?: boolean
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, interactive, selected, ...props }, ref) => (
    <tr
      className={cn(
        'border-b border-border transition-colors duration-150 ease-brand',
        interactive && 'cursor-pointer hover:bg-accent/70',
        selected && 'bg-brand-soft/60',
        className,
      )}
      data-state={selected ? 'selected' : undefined}
      ref={ref}
      {...props}
    />
  ),
)
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<HTMLTableCellElement, React.ComponentProps<'th'>>(
  ({ className, ...props }, ref) => (
    <th
      className={cn(
        'h-9 px-3 text-left align-middle text-xs font-medium tracking-wide text-muted-foreground',
        'first:pl-4 last:pr-4',
        '[&[align=right]]:text-right [&[align=center]]:text-center',
        className,
      )}
      ref={ref}
      scope="col"
      {...props}
    />
  ),
)
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<HTMLTableCellElement, React.ComponentProps<'td'>>(
  ({ className, ...props }, ref) => (
    <td
      className={cn(
        'px-3 py-2.5 align-middle first:pl-4 last:pr-4',
        '[&[align=right]]:text-right [&[align=center]]:text-center',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
TableCell.displayName = 'TableCell'

/** Secondary text inside a cell — an email under a name, a date under a status. */
function TableMeta({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('block text-[0.8125rem] leading-tight text-muted-foreground', className)}
      {...props}
    />
  )
}

/** A right-aligned actions cell that reveals its buttons on row hover. */
function TableActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-1',
        'opacity-100 md:opacity-0 md:transition-opacity md:duration-150',
        'md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100',
        className,
      )}
      {...props}
    />
  )
}

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.ComponentProps<'caption'>>(
  ({ className, ...props }, ref) => (
    <caption className={cn('mt-3 text-xs text-muted-foreground', className)} ref={ref} {...props} />
  ),
)
TableCaption.displayName = 'TableCaption'

export {
  Table,
  TableActions,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableHeader,
  TableMeta,
  TableRow,
}
