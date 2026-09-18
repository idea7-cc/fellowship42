import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  statSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const script = resolve('apps/instance/scripts/recover-owner.mjs')
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'f42-recovery-test-'))
  const capture = join(dir, 'capture.json'),
    output = join(dir, 'enroll.txt')
  writeFileSync(
    join(dir, 'pnpm'),
    `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);
if(process.env.PROVIDER_FAIL){console.error('private provider payload');process.exit(1)};
if(args.includes('--file')) {
 fs.writeFileSync(process.env.CAPTURE,JSON.stringify({args,sql:fs.readFileSync(args[args.indexOf('--file')+1],'utf8')}));
 console.log(JSON.stringify([{results:[{'Total queries executed':10,'Rows written':10}]}]));
} else {
 fs.writeFileSync(process.env.CAPTURE+'.verify',JSON.stringify(args));
 console.log(JSON.stringify([{results:[{recovery_count:Number(process.env.RECOVERY_COUNT ?? 1)}]}]));
}`,
    { mode: 0o700 },
  )
  const exec = (extra = [], env = {}) =>
    spawnSync(
      process.execPath,
      [
        script,
        '--config',
        join(dir, 'wrangler.jsonc'),
        '--database',
        'synthetic',
        '--origin',
        'https://church.example',
        '--email',
        'owner@example.test',
        '--output',
        output,
        '--remote',
        '--confirm-reset-owner',
        ...extra,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          CAPTURE: capture,
          ...env,
        },
      },
    )
  try {
    run({ dir, capture, output, exec })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
test('owner recovery writes a private one-time link and sends only its digest to the provider', () =>
  fixture(({ capture, output, exec }) => {
    const result = exec()
    assert.equal(result.status, 0)
    const link = readFileSync(output, 'utf8').trim()
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get('enroll')
    assert.match(token, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(statSync(output).mode & 0o777, 0o600)
    const request = JSON.parse(readFileSync(capture, 'utf8'))
    assert.equal(request.sql.includes(token), false)
    assert.ok(
      request.sql.includes(createHash('sha256').update(token).digest('hex')),
    )
    assert.equal((result.stdout + result.stderr).includes(token), false)
    assert.ok(request.args.includes('--remote'))
    const verify = JSON.parse(readFileSync(capture + '.verify', 'utf8'))
    assert.ok(verify.includes('--command'))
    assert.ok(verify.includes('--remote'))
    assert.equal(JSON.stringify(verify).includes(token), false)
    assert.ok(
      request.sql.indexOf('UPDATE agent_connections') <
        request.sql.indexOf('INSERT INTO local_auth_enrollments'),
    )
  }))
test('owner recovery preserves existing files and rejects conflicting targets before provider calls', () =>
  fixture(({ capture, output, exec }) => {
    writeFileSync(output, 'keep')
    assert.equal(exec().status, 1)
    assert.equal(readFileSync(output, 'utf8'), 'keep')
    assert.equal(existsSync(capture), false)
    rmSync(output)
    assert.equal(exec(['--local']).status, 1)
    assert.equal(existsSync(capture), false)
  }))
test('owner recovery sanitizes provider failures and removes unusable link files', () =>
  fixture(({ capture, output, exec }) => {
    let result = exec([], { PROVIDER_FAIL: '1' })
    assert.equal(result.status, 1)
    assert.equal(existsSync(output), false)
    assert.equal(
      (result.stdout + result.stderr).includes('private provider payload'),
      false,
    )
    assert.equal(existsSync(capture), false)
    result = exec([], { RECOVERY_COUNT: '0' })
    assert.equal(result.status, 1)
    assert.equal(existsSync(output), false)
  }))
