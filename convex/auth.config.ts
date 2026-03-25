// Replace this before enabling real Clerk auth for a deployment.
const clerkIssuerDomain = "https://replace-me.clerk.accounts.dev";

export default {
  providers: [
    {
      domain: clerkIssuerDomain,
      applicationID: "convex",
    },
  ],
};
