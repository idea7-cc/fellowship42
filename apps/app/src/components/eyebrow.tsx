import { cn } from '@/lib/cn'
import { Badge, type BadgeProps } from '@/components/ui/badge'

interface EyebrowProps extends BadgeProps {}

/**
 * Small uppercase label used above headings (e.g. "Member portal", "Ministry landing page").
 * Built on the Badge primitive with the default (accent-strong) variant.
 */
export function Eyebrow({ className, ...props }: EyebrowProps) {
  return <Badge className={cn('mb-4', className)} {...props} />
}
