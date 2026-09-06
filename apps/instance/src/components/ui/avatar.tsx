import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

const avatarVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium select-none',
  {
    defaultVariants: { size: 'default' },
    variants: {
      size: {
        xs: 'size-5 text-[0.5625rem]',
        sm: 'size-6 text-[0.625rem]',
        default: 'size-8 text-xs',
        lg: 'size-10 text-sm',
        xl: 'size-14 text-lg',
      },
    },
  },
)

/**
 * Six tints from the categorical ramp, picked by a hash of the name — a
 * directory reads faster when the same person is the same color every time,
 * and hashing gets that without storing a color per record.
 *
 * The initials stay on a text token rather than the hue: several ramp slots
 * sit below 3:1 on a light surface, so hue-colored initials would be
 * unreadable for a third of the alphabet.
 */
const tints = [
  'bg-chart-1/20 text-foreground',
  'bg-chart-2/20 text-foreground',
  'bg-chart-3/20 text-foreground',
  'bg-chart-5/20 text-foreground',
  'bg-chart-6/20 text-foreground',
  'bg-chart-7/20 text-foreground',
]

function tintFor(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }
  return tints[Math.abs(hash) % tints.length]
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export interface AvatarProps
  extends React.ComponentProps<'span'>, VariantProps<typeof avatarVariants> {
  name: string
  src?: string | null
}

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, name, size, src, ...props }, ref) => {
    const [failed, setFailed] = React.useState(false)
    const showImage = Boolean(src) && !failed

    return (
      <span
        className={cn(
          avatarVariants({ size }),
          !showImage && tintFor(name),
          className,
        )}
        ref={ref}
        // The name is already adjacent in every current usage, so the avatar
        // is decorative rather than a second announcement of the same text.
        aria-hidden
        {...props}
      >
        {showImage ? (
          <img
            alt=""
            className="size-full object-cover"
            onError={() => setFailed(true)}
            src={src as string}
          />
        ) : (
          initialsFrom(name)
        )}
      </span>
    )
  },
)
Avatar.displayName = 'Avatar'

export { Avatar, avatarVariants, initialsFrom }
