import Link from 'next/link'

import { Button } from '@/components/ui/button'

type Props = {
  label?: string
}

export function SignOutButton({ label = 'Log out' }: Props) {
  return (
    <Button asChild variant="secondary">
      <Link href="/logout">{label}</Link>
    </Button>
  )
}
