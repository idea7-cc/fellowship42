import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const ignored = new Set([
  'node_modules',
  'dist',
  'artifacts',
  '.git',
  '.wrangler',
])
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  )
  return (
    await Promise.all(
      entries.map(async (entry) => {
        if (ignored.has(entry.name)) return []
        const file = path.join(directory, entry.name)
        return entry.isDirectory()
          ? files(file)
          : /\.(?:[cm]?[jt]sx?|astro)$/.test(entry.name) &&
              !entry.name.endsWith('.d.ts')
            ? [file]
            : []
      }),
    )
  ).flat()
}
const owner = (relative) =>
  /^(apps|packages|tooling)\/[^/]+/.exec(relative)?.[0]
const browser = (relative) =>
  /^apps\/(instance|dashboard)\/src\//.test(relative) &&
  !/\/worker(?:\.spec)?\.ts$/.test(relative)
const slash = (value) => value.split(path.sep).join('/')

export async function inspectImportBoundaries(root, kind) {
  const errors = []
  const graph = new Map()
  const optionsByConfig = new Map()
  const allowed =
    kind === 'public'
      ? {
          'apps/instance': ['packages/brand', 'packages/management-protocol'],
          'apps/project-site': ['packages/brand'],
          'packages/brand': [],
          'packages/management-protocol': [],
          'tooling/f42ctl': ['packages/management-protocol'],
        }
      : {
          'apps/control-plane': [
            'packages/audit',
            'packages/entitlements',
            'packages/partner-domain',
            'packages/management-client',
            'packages/cloudflare-orchestrator',
            'packages/mcp-adapter',
          ],
          'apps/dashboard': [],
          'packages/audit': [],
          'packages/entitlements': [],
          'packages/partner-domain': [],
          'packages/management-client': [],
          'packages/cloudflare-orchestrator': ['packages/management-client'],
          'packages/mcp-adapter': [],
        }
  for (const file of (
    await Promise.all(
      ['apps', 'packages', 'tooling'].map((folder) =>
        files(path.join(root, folder)),
      ),
    )
  ).flat()) {
    const relative = slash(path.relative(root, file))
    const fromOwner = owner(relative)
    const config = ts.findConfigFile(path.dirname(file), ts.sys.fileExists)
    if (!optionsByConfig.has(config)) {
      const loaded = config && ts.readConfigFile(config, ts.sys.readFile)
      optionsByConfig.set(
        config,
        loaded && !loaded.error
          ? ts.parseJsonConfigFileContent(
              loaded.config,
              ts.sys,
              path.dirname(config),
            ).options
          : { moduleResolution: ts.ModuleResolutionKind.Bundler },
      )
    }
    let source = await readFile(file, 'utf8')
    if (file.endsWith('.astro'))
      source = /^---\s*\n([\s\S]*?)\n---/.exec(source)?.[1] ?? ''
    const parsed = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
    )
    const edges = []
    const visit = (node) => {
      let specifier
      let typeOnly = false
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        specifier = node.moduleSpecifier
        typeOnly = Boolean(node.isTypeOnly || node.importClause?.isTypeOnly)
        const bindings = node.importClause?.namedBindings
        if (
          bindings &&
          ts.isNamedImports(bindings) &&
          !node.importClause.name &&
          bindings.elements.length > 0
        )
          typeOnly ||= bindings.elements.every((element) => element.isTypeOnly)
        if (
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0
        )
          typeOnly ||= node.exportClause.elements.every(
            (element) => element.isTypeOnly,
          )
      } else if (
        ts.isImportTypeNode(node) &&
        ts.isLiteralTypeNode(node.argument)
      ) {
        specifier = node.argument.literal
        typeOnly = true
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === 'require'))
      ) {
        specifier = node.arguments[0]
      }
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const name = specifier.text
        if (
          kind === 'public' &&
          (name.includes('fellowship42-cloud') ||
            /^@fellowship42\/(cloud|control-plane|dashboard|partner-console)(\/|$)/.test(
              name,
            ))
        )
          errors.push(`${relative}: private import ${name}`)
        if (
          kind === 'private' &&
          /^@fellowship42\//.test(name) &&
          fromOwner !== 'packages/management-client'
        )
          errors.push(
            `${relative}: public packages must enter through management-client`,
          )
        const resolved = ts.resolveModuleName(
          name,
          file,
          optionsByConfig.get(config),
          ts.sys,
        ).resolvedModule
        const target = resolved
          ? path.resolve(resolved.resolvedFileName)
          : name.startsWith('.')
            ? path.resolve(path.dirname(file), name)
            : null
        if (target) {
          const targetRelative = slash(path.relative(root, target))
          if (
            targetRelative.startsWith('../') &&
            !target.includes('/node_modules/')
          )
            errors.push(`${relative}: import escapes the repository: ${name}`)
          const toOwner = owner(targetRelative)
          if (
            toOwner &&
            fromOwner !== toOwner &&
            !(allowed[fromOwner] ?? []).includes(toOwner)
          )
            errors.push(`${relative}: forbidden dependency on ${toOwner}`)
          if (
            browser(relative) &&
            (/\/worker\//.test(targetRelative) ||
              /^apps\/control-plane\//.test(targetRelative) ||
              /\/src\/worker\.ts$/.test(targetRelative))
          )
            errors.push(`${relative}: browser imports server code ${name}`)
          if (
            (relative.startsWith('apps/instance/worker/') ||
              relative.startsWith('apps/instance/contracts/')) &&
            targetRelative.startsWith('apps/instance/src/')
          )
            errors.push(
              `${relative}: Worker/contracts import the frontend ${name}`,
            )
          if (
            relative.startsWith('apps/instance/contracts/') &&
            targetRelative.startsWith('apps/instance/worker/')
          )
            errors.push(
              `${relative}: neutral contract imports Worker code ${name}`,
            )
          if (
            !typeOnly &&
            !targetRelative.startsWith('../') &&
            !target.includes('/node_modules/')
          )
            edges.push(target)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
    graph.set(file, edges)
  }
  const done = new Set()
  const active = []
  const visit = (file) => {
    const index = active.indexOf(file)
    if (index !== -1) {
      errors.push(
        `runtime import cycle: ${active
          .slice(index)
          .concat(file)
          .map((entry) => slash(path.relative(root, entry)))
          .join(' -> ')}`,
      )
      return
    }
    if (done.has(file)) return
    active.push(file)
    for (const target of graph.get(file) ?? []) visit(target)
    active.pop()
    done.add(file)
  }
  for (const file of graph.keys()) visit(file)
  return errors
}
