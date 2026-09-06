# ADR 0021: Instance authentication errors and API cache policy

- Status: accepted
- Date: 2026-09-05

## Decision

The current staff authentication adapter continues to verify Cloudflare Access
assertions and resolve application-owned membership permissions. Invalid JOSE
assertions are authentication failures (401); unavailable key retrieval remains
a server failure. Accept only the expected RS256 assertion algorithm.

Instance `/api` responses explicitly use `Cache-Control: private, no-store`,
including errors. Public media retains its existing separate cache policy.
This conservative API policy prevents sensitive directory, finance, session,
and management JSON from entering browser or intermediary caches by default.

This changes neither identity ownership nor role/capability authority. It does
not accept ADR 0020 or implement member authentication. Workers tests cover
malformed assertions and cache headers on rejected private requests.
