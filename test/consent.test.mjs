import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// The plugin reads the agents home once, at import time, so every case runs in
// its own child process with its own DSH_AGENTS_HOME.
const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, '..', 'index.js')

// The required skill list is part of the plugin's contract with this test: read
// it from the source so the fake home always matches what the code asks for.
const source = readFileSync(entry, 'utf8')
const required = [...source.match(/REQUIRED_SKILLS = \[([\s\S]*?)\]/)[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
assert.ok(required.length > 20, `expected the full skill list, got ${required.length}`)

const TRACKER = 'docs/agents/issue-tracker.md'
const TRACKER_BODY = '# Issue tracker\n\nLocal markdown files under .scratch, one per feature.\n'

function fakeHome(skills) {
  const home = mkdtempSync(join(tmpdir(), 'matt-home-'))
  // DSH_AGENTS_HOME is the agents root; the CLI installs into its skills/ child.
  mkdirSync(join(home, 'skills'), { recursive: true })
  for (const name of skills) {
    mkdirSync(join(home, 'skills', name), { recursive: true })
    writeFileSync(join(home, 'skills', name, 'SKILL.md'), `# ${name}\n`, 'utf8')
  }
  // The setup skill ships the templates the plugin copies into a repository.
  const setup = join(home, 'skills', 'setup-matt-pocock-skills')
  if (skills.includes('setup-matt-pocock-skills')) {
    writeFileSync(join(setup, 'issue-tracker-local.md'), TRACKER_BODY, 'utf8')
    writeFileSync(join(setup, 'domain.md'), '# Domain\n\nGlossary and ADR pointers.\n', 'utf8')
    writeFileSync(join(setup, 'triage-labels.md'), '# Labels\n', 'utf8')
  }
  return home
}

function fakeRepo(initialised) {
  const repo = mkdtempSync(join(tmpdir(), 'matt-repo-'))
  if (initialised) {
    mkdirSync(join(repo, dirname(TRACKER)), { recursive: true })
    writeFileSync(join(repo, TRACKER), TRACKER_BODY, 'utf8')
  }
  return repo
}

// The probe reports how many approval requests the tool made and what they said,
// which is the only way to observe a prompt that the model would merely see.
function run({ home, repo }) {
  const probe = `
import { apply } from ${JSON.stringify(pathToFileURL(entry).href)}
const defs = []
const asked = []
const ctx = {
  get: (k) => {
    if (k === 'tools') return { register: (d) => { defs.push(d); return () => {} } }
    if (k === 'approval') return { request: async (req) => { asked.push(req.displayReason || { en: req.reason }); return 'allowed-once' } }
    return undefined
  },
  effect: (fn) => fn(),
}
apply(ctx)
const tool = defs.find((d) => d.name === 'flow_stage')
let result = null
let error = null
try {
  result = await tool.execute({ action: 'status', feature: 'probe' }, {
    agent: { id: 'probe', session: { cwd: ${JSON.stringify(repo)} } },
    callId: 'call-probe',
  })
} catch (e) {
  error = e.message
}
console.log('RESULT:' + JSON.stringify({ asked, stage: result && result.stage, error }))
`
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: repo,
    env: { ...process.env, DSH_AGENTS_HOME: home, DSH_MATT_FLOW_NO_INSTALL: '1' },
    encoding: 'utf8',
  })
  const line = out.stdout.split('\n').find((l) => l.startsWith('RESULT:'))
  assert.ok(line, `probe produced no result: ${out.stdout}${out.stderr}`)
  return JSON.parse(line.slice('RESULT:'.length))
}

test('a fully provisioned repo is never interrupted by an approval prompt', () => {
  const { asked, error } = run({ home: fakeHome(required), repo: fakeRepo(true) })
  assert.equal(error, null)
  assert.deepEqual(asked, [], 'status must not ask for anything when nothing is missing')
})

test('an uninitialised repo asks once, naming the files it will write', () => {
  const { asked, error } = run({ home: fakeHome(required), repo: fakeRepo(false) })
  assert.equal(error, null)
  assert.equal(asked.length, 1, 'exactly one prompt per call')
  assert.match(asked[0].en, /docs\/agents\/issue-tracker\.md/)
  assert.match(asked[0].zh, /docs\/agents\/issue-tracker\.md/)
  // Nothing to install, so no shell command belongs in the card.
  assert.doesNotMatch(asked[0].en, /^\$ |\n\$ /m)
})

test('a missing skill asks once and shows the exact command', () => {
  const home = fakeHome(required.slice(1))
  // Installation is disabled in tests, so the call ends in a refusal; the prompt
  // is what this case is about, and it is recorded before that refusal.
  const { asked } = run({ home, repo: fakeRepo(true) })
  assert.equal(asked.length, 1)
  assert.match(asked[0].en, new RegExp(required[0]))
  assert.match(asked[0].en, /skills@latest add/)
  assert.match(asked[0].en, new RegExp(`-s ${required[0]} `), 'the command must name the missing skill')
})

test('refusing the prompt leaves the repo untouched', () => {
  const home = fakeHome(required)
  const repo = fakeRepo(false)
  const probe = `
import { apply } from ${JSON.stringify(pathToFileURL(entry).href)}
import { existsSync } from 'node:fs'
const defs = []
const ctx = {
  get: (k) => {
    if (k === 'tools') return { register: (d) => { defs.push(d); return () => {} } }
    if (k === 'approval') return { request: async () => 'rejected' }
    return undefined
  },
  effect: (fn) => fn(),
}
apply(ctx)
const tool = defs.find((d) => d.name === 'flow_stage')
let error = null
try {
  await tool.execute({ action: 'status', feature: 'probe' }, {
    agent: { id: 'probe', session: { cwd: ${JSON.stringify(repo)} } },
    callId: 'call-probe',
  })
} catch (e) {
  error = e.message
}
console.log('RESULT:' + JSON.stringify({ error, tracker: existsSync(${JSON.stringify(join(repo, TRACKER))}) }))
`
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: repo,
    env: { ...process.env, DSH_AGENTS_HOME: home, DSH_MATT_FLOW_NO_INSTALL: '1' },
    encoding: 'utf8',
  })
  const line = out.stdout.split('\n').find((l) => l.startsWith('RESULT:'))
  assert.ok(line, `probe produced no result: ${out.stdout}${out.stderr}`)
  const { error, tracker } = JSON.parse(line.slice('RESULT:'.length))
  assert.match(error, /did not approve/)
  assert.equal(tracker, false, 'a refused prompt must not create files')
})
