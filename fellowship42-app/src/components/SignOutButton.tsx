import Link from 'next/link'

type Props = {
  className?: string
  label?: string
}

export function SignOutButton({ className = 'button secondary', label = 'Log out' }: Props) {
  return (
    <Link className={className} href="/logout">
      {label}
    </Link>
  )
}
