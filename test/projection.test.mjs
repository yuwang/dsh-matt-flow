import { apply } from '../index.js'
let def = null
const ctx = {
  get: (k) => (k === 'tools' ? { register: () => () => {} } : k === 'sessionProjections' ? { register: (d) => { def = d; return () => {} } } : undefined),
  effect: (f) => f(),
}
apply(ctx)

let pass = 0, fail = 0
const ok = (n, c, extra = '') => { if (c) { pass++; console.log('  ok  ' + n) } else { fail++; console.log('  FAIL ' + n + (extra ? ' :: ' + extra : '')) } }
const fold = (state, event) => def.apply(state, event)
const call = (name, callId) => ({ type: 'tool/call', data: { name, callId } })
const result = (callId, text, meta = { cwd: '/' }) => ({ type: 'tool/result', data: { meta, message: { toolCallId: callId, content: [{ type: 'text', text }] } } })

let s = def.init()
ok('init has no flow', s.flow === null && s.pendingCallId === null)

// the bug: unrelated tool output must not become workflow state
s = fold(s, call('bash', 'c1'))
const afterBash = fold(s, result('c1', 'first: installing'))
ok('bash output is ignored', afterBash.flow === null, JSON.stringify(afterBash.flow))

// unmatched result (no pending call) is ignored even if text looks right
const orphan = fold(def.init(), result('zzz', 'x: grill'))
ok('orphan result ignored', orphan.flow === null)

// flow_stage call pairs with its result, text fallback path
s = fold(s, call('flow_stage', 'fs1'))
ok('pending call recorded', s.pendingCallId === 'fs1')
s = fold(s, result('fs1', 'sticky-notes: grill (next: spec) — advanced'))
ok('text fallback folds', s.flow && s.flow.feature === 'sticky-notes' && s.flow.stage === 'grill', JSON.stringify(s.flow))
ok('pending cleared', s.pendingCallId === null)
ok('next derived', s.flow.next === 'spec', String(s.flow.next))

// meta path carries gates
let m = fold(s, call('flow_stage', 'fs2'))
m = fold(m, result('fs2', 'ignored text', { tool: 'flow_stage', feature: 'sticky-notes', stage: 'spec', next: 'tickets', gates: [{ stage: 'tickets', ready: false, requirement: 'need spec.md' }] }))
ok('meta path folds with gates', m.flow.stage === 'spec' && m.flow.gates.length === 1, JSON.stringify(m.flow))

// unrelated events keep reference
const started = fold(m, { type: 'turn/start', data: {} })
ok('unrelated event keeps reference', started === m)
ok('wire view exposes flow', def.wire.view(m) === m.flow)
ok('wire view of empty state is null', def.wire.view(def.init()) === null)

// schema round-trip
ok('state schema accepts state', def.stateSchema.parse(m) === m || def.stateSchema.parse(m).flow.stage === 'spec')
ok('view schema accepts flow', def.wire.viewSchema.parse(m.flow) === m.flow)
let threw = false
try { def.wire.viewSchema.parse({ stage: 1 }) } catch { threw = true }
ok('view schema rejects malformed', threw)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
