// Plain `tsc` does not understand `.astro` files; the host site compiles and
// checks them. This declaration lets the TypeScript entry points typecheck.
declare module '*.astro' {
  const component: (props: Record<string, unknown>) => unknown
  export default component
}
