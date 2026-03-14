import Link from 'next/link'
import React from 'react'

import { getPublishedChurches } from '@/lib/public-site'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const churches = await getPublishedChurches()

  return (
    <div className="site-shell">
      <section className="hero">
        <div className="eyebrow">Payload-powered church operations</div>
        <div className="hero-grid">
          <div>
            <h1>Run the church from one system instead of five.</h1>
            <p className="lede">
              Fellowship42 is built for churches that need one place to manage ministries,
              people, contributions, events, facilities, and a visitor-ready website.
            </p>
            <div className="hero-actions">
              <Link className="button primary" href="/admin">
                Open admin
              </Link>
              <Link className="button secondary" href="/portal">
                Open member portal
              </Link>
              <Link className="button secondary" href="/churches/demo-fellowship">
                View demo church
              </Link>
            </div>
          </div>
          <div className="hero-panel">
            <div className="metric">
              <strong>1</strong>
              <span>shared source of truth for members, ministries, giving, and events</span>
            </div>
            <div className="metric">
              <strong>7</strong>
              <span>core ministry workflows: people, giving, events, facilities, ministries, groups, courses</span>
            </div>
            <div className="metric">
              <strong>Cloudflare</strong>
              <span>edge delivery with Payload on a Postgres-backed application core</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>What the MVP already covers</h2>
          <p>Payload collections and public routes are wired for the first church software workflow.</p>
        </div>
        <div className="card-grid">
          <article className="feature-card">
            <h3>Church records</h3>
            <p>Churches, users, people, and ministry structures with role-aware admin access.</p>
          </article>
          <article className="feature-card">
            <h3>Programs and events</h3>
            <p>Upcoming events, featured ministries, sermon publishing, and church-specific site pages.</p>
          </article>
          <article className="feature-card">
            <h3>Groups and classes</h3>
            <p>Sunday school, small groups, Bible studies, and recurring cohorts all fit the same group model.</p>
          </article>
          <article className="feature-card">
            <h3>Training and curriculum</h3>
            <p>Courses support new-member tracks, volunteer training, and reusable lesson libraries.</p>
          </article>
          <article className="feature-card">
            <h3>Operations</h3>
            <p>Facilities and contributions establish the base for scheduling and finance workflows.</p>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Published churches</h2>
          <p>The homepage lists churches that have been published through Payload.</p>
        </div>
        <div className="card-grid">
          {churches.docs.map((church) => (
            <article className="church-card" key={church.id}>
              <div className="church-card__meta">
                <span>{church.address?.city}, {church.address?.state}</span>
                <span>{church.serviceTimes?.length ?? 0} service times</span>
              </div>
              <h3>{church.name}</h3>
              <p>{church.summary}</p>
              <Link className="inline-link" href={`/churches/${church.slug}`}>
                Visit church site
              </Link>
            </article>
          ))}
          {!churches.docs.length && (
            <article className="church-card empty">
              <h3>No churches published yet</h3>
              <p>Create a church in the admin panel, mark it as published, and it will appear here.</p>
              <Link className="inline-link" href="/admin">
                Go to admin
              </Link>
            </article>
          )}
        </div>
      </section>
    </div>
  )
}
