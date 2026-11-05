import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { apply } from '../index.js'

const defs = []
const toolsService = { register: (d) => { defs.push(d); return () => {} } }
const ctx = { get: (k) => (k === 'tools' ? toolsService : undefined), effect: (fn) => fn() }
apply(ctx, {})
const tool = defs.find((d) => d.name === 'flow_stage')
const askTool = defs.find((d) => d.name === 'flow_ask')
const skillsTool = defs.find((d) => d.name === 'flow_skills')
const exec = { agent: undefined }

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok  ' + name) }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')) }
}
async function rejects(name, fn, needle) {
  try { await fn(); ok(name, false, 'did not throw') }
  catch (e) { ok(name, String(e.message).includes(needle), e.message) }
}
const call = (args) => tool.execute(args, exec)

const WORK = await mkdtemp(join(tmpdir(), 'matt-flow-test-'))
await mkdir(WORK, { recursive: true })
process.chdir(WORK)
const F = 'checkout-retry'
const featureDir = join(WORK, '.scratch', F)

const s0 = await call({ action: 'status', feature: F })
ok('fresh status starts at grill', s0.stage === 'grill', s0.stage)
ok('fresh next is spec', s0.next === 'spec', s0.next)
ok('spec gate blocked without tracker doc', s0.gates.find(g => g.stage === 'spec')?.ready === false)

await rejects('cannot skip grill->tickets', () => call({ action: 'advance', feature: F, to: 'tickets', evidence: 'x' }), 'cannot skip')
await rejects('grill->spec blocked without evidence', () => call({ action: 'advance', feature: F, to: 'spec', evidence: '  ' }), 'precondition')

await mkdir(join(WORK, 'docs', 'agents'), { recursive: true })
await writeFile(join(WORK, 'docs', 'agents', 'issue-tracker.md'), '# Issue tracker\n\nLocal markdown under .scratch/<feature>/issues, one file per ticket.\n', 'utf8')
const a2 = await call({ action: 'advance', feature: F, to: 'spec', evidence: 'seams: one seam at the retry policy boundary' })
ok('grill->spec ok with tracker doc and evidence', a2.stage === 'spec')
ok('tickets gate blocked on spec.md', a2.gates.find(g => g.stage === 'tickets')?.ready === false)

await rejects('spec->tickets without spec.md', () => call({ action: 'advance', feature: F, to: 'tickets', evidence: 'plan ready' }), 'spec.md')
await mkdir(featureDir, { recursive: true })
await writeFile(join(featureDir, 'spec.md'), '# Spec\n\n' + 'decision '.repeat(40) + '\n', 'utf8')
const a3 = await call({ action: 'advance', feature: F, to: 'tickets', evidence: 'spec written' })
ok('spec->tickets ok once spec.md exists', a3.stage === 'tickets')

await rejects('tickets->implement without issues', () => call({ action: 'advance', feature: F, to: 'implement', evidence: 'go' }), 'issues/')
await mkdir(join(featureDir, 'issues'), { recursive: true })
await writeFile(join(featureDir, 'issues', '01-retry-policy.md'), 'blocked-by: none\n', 'utf8')
const a4 = await call({ action: 'advance', feature: F, to: 'implement', evidence: 'fly' })
ok('tickets->implement ok with one ticket', a4.stage === 'implement')

await rejects('implement->review needs evidence', () => call({ action: 'advance', feature: F, to: 'review', evidence: '' }), 'precondition')
const a5 = await call({ action: 'advance', feature: F, to: 'review', evidence: 'typecheck clean, 4 tests green' })
ok('implement->review ok', a5.stage === 'review')
const a6 = await call({ action: 'advance', feature: F, to: 'done', evidence: 'review passed, committed' })
ok('review->done ok', a6.stage === 'done' && !('next' in a6))

const state = JSON.parse(await readFile(join(featureDir, 'flow.json'), 'utf8'))
ok('history recorded 5 moves', state.history.length === 5, String(state.history.length))
ok('history keeps evidence', state.history[3].evidence.includes('typecheck'))

const back = await call({ action: 'advance', feature: F, to: 'implement', evidence: 'review found a gap' })
ok('rework move allowed', back.stage === 'implement' && back.moved === false)

await rejects('bad slug rejected', () => call({ action: 'status', feature: 'Bad Slug' }), 'slug')
await rejects('unknown stage rejected', () => call({ action: 'advance', feature: F, to: 'deploy', evidence: 'x' }), 'unknown target')
await rejects('same stage rejected', () => call({ action: 'advance', feature: F, to: 'implement', evidence: 'x' }), 'already')

const other = await call({ action: 'status', feature: 'brand-new' })
ok('a new feature starts at grill', other.stage === 'grill' && other.next === 'spec')

// --- flow_ask -------------------------------------------------------------
ok('flow_ask registered', askTool !== undefined)
const goodQuestions = [
  { id: 'stack', title: '技术栈', options: [{ label: 'A) Vite + TS' }, { label: 'B) React' }] },
  { id: 'store', title: '持久化', options: [{ label: 'A) localStorage' }, { label: 'C) 适配接口' }] }
]
const asked = await askTool.execute({ feature: F, questions: goodQuestions }, exec)
ok('flow_ask returns card state', asked.questions === 2 && asked.state.includes('card rendered'), JSON.stringify(asked))
await rejects('flow_ask caps at three', () => askTool.execute({ feature: F, questions: [1,2,3,4].map(i => ({ title: 'q'+i, options: [{label:'a'},{label:'b'}] })) }, exec), 'three')
await rejects('flow_ask needs two options', () => askTool.execute({ feature: F, questions: [{ title: 'q', options: [{ label: 'a' }] }] }, exec), 'two options')
await rejects('flow_ask validates slug', () => askTool.execute({ feature: 'Bad Slug', questions: goodQuestions }, exec), 'slug')

// --- flow_skills -----------------------------------------------------------
ok('flow_skills registered', skillsTool !== undefined)
const sk = await skillsTool.execute({ action: 'status' }, exec)
ok('flow_skills reports present on this machine', sk.state === 'present' && sk.missing.length === 0, JSON.stringify(sk.state))
ok('flow_skills lists the required skills', sk.present.includes('grilling') && sk.present.includes('to-spec'), sk.present.join(','))

console.log(`\n${pass} passed, ${fail} failed`)

process.exit(fail ? 1 : 0)
