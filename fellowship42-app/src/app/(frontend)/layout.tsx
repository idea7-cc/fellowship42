import React from 'react'
import './styles.css'

export const metadata = {
  description: 'Church software for ministries, members, giving, schedules, and public church websites.',
  title: 'Fellowship42',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
