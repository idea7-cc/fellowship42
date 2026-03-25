/**
 * Convex authentication configuration.
 *
 * Convex validates JWTs by fetching the OIDC discovery document at
 * `{domain}/.well-known/openid-configuration` and verifying signatures
 * against the provider's JWKS endpoint.
 *
 * ## Supported providers (pick one)
 *
 * Clerk:   domain = "https://<your-app>.clerk.accounts.dev"
 * WorkOS:  domain = "https://api.workos.com"
 * Auth0:   domain = "https://<your-tenant>.auth0.com"
 *
 * The `applicationID` is matched against the JWT `aud` claim.
 * For Clerk/WorkOS with Convex, this is typically "convex".
 *
 * ## Swapping providers
 *
 * 1. Update the `domain` below to point at your new provider.
 * 2. Update `apps/app/src/lib/auth-provider.tsx` to use the matching
 *    React SDK and `useAuth` hook.
 * 3. No Convex function code needs to change — everything uses
 *    `tokenIdentifier` from `convex/lib/auth.ts`.
 */

// ── Replace before deploying ───────────────────────────────────────────
// Set this to your Clerk issuer URL, WorkOS API URL, or Auth0 tenant URL.
const providerDomain = "https://replace-me.clerk.accounts.dev";

export default {
  providers: [
    {
      domain: providerDomain,
      applicationID: "convex",
    },
  ],
};
