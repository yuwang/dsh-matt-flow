import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

// A fake agents home with no skills, so the module under test sees an
// unprovisioned machine. The probe runs in a child process because the plugin
// reads the environment once, at import time.
const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, '..', 'index.js')

const probe = `
import { apply } from ${JSON.stringify(pathToFileURL(entry).href)}
const defs = []
const approval = { request: async () => 'allowed-once' }
const ctx = {
  get: (k) => (k === 'tools' ? { register: (d) => { defs.push(d); return () => {} } } : k === 'approval' ? approval : undefined),
  effect: (fn) => fn(),
}
apply(ctx)
const tool = defs.find((d) => d.name === 'flow_stage')
try {
  await tool.execute({ action: 'status', feature: 'probe' }, { agent: { id: 'probe' }, callId: 'call-probe' })
  console.log('NO_THROW')
} catch (error) {
  console.log('THREW:' + error.message.replace(/\\n/g, ' | '))
}
`

const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
  // Without this the skills CLI installs into the real ~/.agents/skills: it
  // honours HOME, not DSH_AGENTS_HOME, so a test would change the user's machine.
  env: { ...process.env, DSH_AGENTS_HOME: '/nonexistent-agents-home-for-test', DSH_MATT_FLOW_NO_INSTALL: '1' },
  encoding: 'utf8',
})

const out = `${result.stdout || ''}${result.stderr || ''}`.trim()
const threw = out.includes('THREW:')
const namesSkills = out.includes('grilling') && out.includes('to-spec')
const givesCommand = out.includes('skills@latest add') && out.includes('-s')

let pass = 0
let fail = 0
const ok = (name, condition, extra = '') => {
  if (condition) { pass++; console.log('  ok  ' + name) }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')) }
}

ok('flow_stage refuses when skills are missing', threw, out.slice(0, 200))

// A read-only session must not be written to at all: the guard comes before the
// skill check, so the refusal names the permission, not the skills.
const roProbe = `
import { apply } from ${JSON.stringify(pathToFileURL(entry).href)}
const defs = []
const refused = {
  get: (k) => {
    if (k === 'tools') return { register: (d) => { defs.push(d); return () => {} } }
    if (k === 'approval') return { request: async () => 'rejected' }
    return undefined
  },
  effect: (fn) => fn(),
}
apply(refused)
const tool = defs.find((d) => d.name === 'flow_stage')
try {
  await tool.execute({ action: 'status', feature: 'probe' }, { agent: { session: { cwd: process.cwd() } } })
  console.log('NO_THROW')
} catch (error) {
  console.log('THREW:' + error.message.split(String.fromCharCode(10)).join(' | '))
}
`
const ro = spawnSync(process.execPath, ['--input-type=module', '-e', roProbe], {
  env: { ...process.env, DSH_AGENTS_HOME: '/nonexistent-agents-home-for-test', DSH_MATT_FLOW_NO_INSTALL: '1' },
  encoding: 'utf8',
})
const roOut = `${ro.stdout || ''}${ro.stderr || ''}`.trim()
ok('a rejected approval writes nothing', roOut.includes('THREW:') && /did not approve/.test(roOut), roOut.slice(0, 240))
ok('the refusal names the missing skills', namesSkills, out.slice(0, 200))
ok('the refusal hands over the install command', givesCommand, out.slice(0, 200))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
