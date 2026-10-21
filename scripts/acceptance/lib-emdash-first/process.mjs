import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { createServer, connect } from 'node:net'
import path from 'node:path'

/**
 * Child processes for the acceptance run. Every long-running server is started
 * in its own process group and tracked, so a failure, Ctrl-C, or normal exit
 * stops the server and every worker it spawned (workerd included).
 */

const running = new Set()
// Process groups of long-running servers, kept until the server is stopped
// even if its leader (wrangler) exits first.
const serverGroups = new Set()

/** Environment for children: the current Node first on PATH, no telemetry. */
export function childEnv(extra = {}) {
  const nodeBin = path.dirname(process.execPath)
  return {
    ...process.env,
    PATH: `${nodeBin}${path.delimiter}${process.env.PATH ?? ''}`,
    CI: '1',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    WRANGLER_SEND_METRICS: 'false',
    ASTRO_TELEMETRY_DISABLED: '1',
    ...extra,
  }
}

function tail(text, lines = 40) {
  return text.split('\n').slice(-lines).join('\n')
}

/**
 * Runs a command to completion and returns its output. Rejects with the tail
 * of the output when it fails or exceeds its timeout.
 */
export function run(command, args, options = {}) {
  const { cwd, env, timeoutMs = 10 * 60_000, logFile, input } = options
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? childEnv(),
      detached: true,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    })
    running.add(child)
    const log = logFile ? createWriteStream(logFile, { flags: 'a' }) : null
    log?.write(`\n$ ${command} ${args.join(' ')}\n`)
    let output = ''
    const collect = (chunk) => {
      output += chunk
      log?.write(chunk)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    if (input !== undefined) child.stdin.end(input)
    const timer = setTimeout(() => {
      killGroup(child, 'SIGKILL')
      reject(
        new Error(
          `${command} ${args.join(' ')} timed out after ${timeoutMs} ms\n${tail(output)}`,
        ),
      )
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      running.delete(child)
      log?.end()
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      running.delete(child)
      log?.end()
      if (code === 0) resolve(output)
      else
        reject(
          new Error(
            `${command} ${args.join(' ')} exited with ${code ?? signal}\n${tail(output)}`,
          ),
        )
    })
  })
}

/**
 * Signals the child's whole process group. With `evenIfExited`, the group is
 * signalled after its leader has exited too, so a worker (workerd) that
 * outlived wrangler is still stopped.
 */
function killGroup(child, signal, { evenIfExited = false } = {}) {
  const exited = child.exitCode !== null || child.signalCode !== null
  if (exited && !evenIfExited) return
  if (exited) {
    try {
      process.kill(-child.pid, signal)
    } catch {
      // The whole group is gone.
    }
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      // Already gone.
    }
  }
}

/** A long-running server in its own process group. */
export class Server {
  constructor(name, command, args, options = {}) {
    this.name = name
    this.command = command
    this.args = args
    this.options = options
    this.output = ''
    this.child = null
  }

  start() {
    const { cwd, env, logFile } = this.options
    const log = logFile ? createWriteStream(logFile, { flags: 'a' }) : null
    log?.write(`\n$ ${this.command} ${this.args.join(' ')}\n`)
    this.child = spawn(this.command, this.args, {
      cwd,
      env: env ?? childEnv(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    running.add(this.child)
    serverGroups.add(this.child.pid)
    const collect = (chunk) => {
      this.output = (this.output + chunk).slice(-200_000)
      log?.write(chunk)
    }
    this.child.stdout.on('data', collect)
    this.child.stderr.on('data', collect)
    this.exited = new Promise((resolve) =>
      this.child.on('close', (code, signal) => {
        running.delete(this.child)
        log?.end()
        resolve(code ?? signal)
      }),
    )
    return this
  }

  get alive() {
    return (
      this.child !== null &&
      this.child.exitCode === null &&
      this.child.signalCode === null
    )
  }

  /** Polls `probe` until it returns true, the server exits, or time runs out. */
  async waitUntil(probe, { timeoutMs = 120_000, intervalMs = 500 } = {}) {
    const deadline = Date.now() + timeoutMs
    let lastError
    while (Date.now() < deadline) {
      if (!this.alive)
        throw new Error(
          `${this.name} exited before it was ready\n${tail(this.output)}`,
        )
      try {
        if (await probe()) return
      } catch (error) {
        lastError = error
      }
      await sleep(intervalMs)
    }
    throw new Error(
      `${this.name} was not ready within ${timeoutMs} ms (${lastError?.message ?? 'probe never passed'})\n${tail(this.output)}`,
    )
  }

  async stop({ graceMs = 5_000 } = {}) {
    if (!this.child) return
    if (this.alive) {
      killGroup(this.child, 'SIGTERM')
      if (!(await exitsWithin(this.exited, graceMs))) {
        killGroup(this.child, 'SIGKILL')
        await exitsWithin(this.exited, graceMs)
      }
    }
    // workerd may outlive wrangler briefly; make sure the group is gone.
    killGroup(this.child, 'SIGKILL', { evenIfExited: true })
    serverGroups.delete(this.child.pid)
    this.child = null
  }
}

/** Stops every tracked child process group. Safe to call more than once. */
export function stopAll() {
  for (const child of running) killGroup(child, 'SIGKILL')
  running.clear()
  for (const pid of serverGroups) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      // The whole group is gone.
    }
  }
  serverGroups.clear()
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Resolves true when `exited` settles within `ms`, without holding the event loop afterwards. */
async function exitsWithin(exited, ms) {
  let timer
  const expired = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), ms)
  })
  try {
    return await Promise.race([exited.then(() => true), expired])
  } finally {
    clearTimeout(timer)
  }
}

/** True when something accepts TCP connections on localhost:port. */
export function portInUse(port) {
  const attempt = (host) =>
    new Promise((resolve) => {
      const socket = connect({ port, host })
      socket.setTimeout(1_000)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.once('error', () => resolve(false))
    })
  return Promise.all([attempt('127.0.0.1'), attempt('::1')]).then((results) =>
    results.some(Boolean),
  )
}

export async function waitForPortFree(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await portInUse(port))) return
    await sleep(250)
  }
  throw new Error(`port ${port} is still in use after ${timeoutMs} ms`)
}

/** An ephemeral free port (for wrangler's inspector). */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}
