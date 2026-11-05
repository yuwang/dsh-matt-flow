/**
 * dsh-matt-flow — a thin orchestration layer over the user's Matt Pocock Agent Skills.
 *
 * It contributes two things and nothing else:
 *   1. a system-prompt section that makes the installed skill suite usable as a
 *      staged engineering workflow, and
 *   2. the `flow_stage` tool, which owns the phase of one feature and refuses
 *      skipped stages or missing artifacts.
 *
 * The skills themselves stay where they are (~/.agents/skills); this plugin never
 * copies or edits them, so `npx skills update` cannot drift it.
 *
 * This module deliberately imports only Node builtins: it is installed as a
 * `link:` package outside the profile, where bare `@deepseek-ai/*` specifiers do
 * not resolve.
 *
 * @module dsh-matt-flow
 */
import { spawn } from 'node:child_process'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export const name = 'matt-flow'

/** Bumped with package.json; the startup breadcrumbs carry it so a stale module is visible. */
const PLUGIN_VERSION = '0.7.2'

/** Startup breadcrumbs, so a "never started" report can be told apart from a silent no-op. */
const LOG_DIR = tmpdir()
const LOAD_LOG = join(LOG_DIR, 'dsh-matt-flow-load.log')
const APPLY_LOG = join(LOG_DIR, 'dsh-matt-flow-apply.log')

/** The upstream skill package this workflow is built on. */
const SKILLS_PACKAGE = 'mattpocock/skills'

/** Skills the flow cannot run without; every one must exist under the agents home. */
const REQUIRED_SKILLS = ['ask-matt', 'grilling', 'to-spec', 'to-tickets', 'implement', 'tdd', 'code-review']

/** Bootstrap bookkeeping lives beside the profile, never inside the user's skills tree. */
const BOOTSTRAP_STATE = join(homedir(), '.dsh', 'matt-flow-bootstrap.json')
const BOOTSTRAP_LOG = join(LOG_DIR, 'dsh-matt-flow-bootstrap.log')

/** The npx launcher differs per platform; Windows resolves it through PATHEXT. */
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx'

/** Retry a failed install at most this often. */
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000

/** How long an install may run before it is recorded as timed out. */
const INSTALL_TIMEOUT_MS = 240 * 1000

function mark(file, note) {
  try {
    appendFileSync(file, `${new Date().toISOString()} pid=${process.pid} ${note}\n`)
  } catch {
    // diagnostics must never break activation
  }
}

mark(LOAD_LOG, `module imported v${PLUGIN_VERSION}`)

const STAGES = ['grill', 'spec', 'tickets', 'implement', 'review', 'done']

/** Old logs recorded the retired pre-grill stages; fold them onto the real first stage. */
const STAGE_ALIASES = { setup: 'grill', idea: 'grill' }

/**
 * Resolve a recorded stage name onto the current ladder.
 * @param {unknown} stage stage as stored or folded
 * @returns {string} a current stage, defaulting to the first one
 */
function normalizeStage(stage) {
  const name = typeof stage === 'string' ? (STAGE_ALIASES[stage] ?? stage) : ''
  return STAGES.includes(name) ? name : STAGES[0]
}

const FEATURE_ROOT = '.scratch'
const TRACKER_DOC = 'docs/agents/issue-tracker.md'
const TRACKER_MIN_CHARS = 40
const SPEC_MIN_CHARS = 200
const EVIDENCE_MIN_CHARS = 8

const FLOW_SECTION = `# Development workflow (Matt Pocock skill suite)

This deployment carries the user's engineering skills under \`~/.agents/skills\`. Treat that method as the default way to do feature work.

## What you can and cannot load

Model-invocable — load them with the \`skill\` tool: \`grilling\`, \`tdd\`, \`code-review\`, \`codebase-design\`, \`domain-modeling\`, \`diagnosing-bugs\`, \`prototype\`, \`research\`, \`pr\`, \`resolving-merge-conflicts\`, \`migrate-to-shoehorn\`, \`setup-pre-commit\`.

User-only — the model cannot load these; only the user can type them: \`/ask-matt\`, \`/grill-with-docs\`, \`/grill-me\`, \`/to-spec\`, \`/to-tickets\`, \`/implement\`, \`/triage\`, \`/wayfinder\`, \`/improve-codebase-architecture\`, \`/handoff\`, \`/retro\`, \`/wait-what\`.

Never claim to have run a user-only skill. Either do the equivalent work with the primitives, or name the command and ask the user to run it.

## When the suite is missing

If the catalog above does not list them, the suite is not installed yet. This preset installs it in the background from \`mattpocock/skills\` on first use. Call \`flow_skills\` with action \`status\` to see whether it is \`present\`, \`installing\`, or \`failed\` (the result carries the log tail), and action \`install\` to retry after a network failure. While an install is running, tell the user it is installing instead of hand-writing what a skill would have said.

## Route

- New idea or feature request → the main flow below.
- A bug that survives a first look → load \`diagnosing-bugs\`. Do not theorise before you have one command that already goes red on this bug.
- Incoming issues to sort → ask the user to run \`/triage\`.
- Fog too thick for one session → ask the user to run \`/wayfinder\`.
- A design question that needs runnable code → load \`prototype\`.
- Codebase upkeep → propose \`/improve-codebase-architecture\`.

## Before the first spec

The suite assumes a per-repo decision about where issues live. Nothing before \`spec\` needs it, so settle it when you first reach \`spec\`:

- Default the issue tracker to **local markdown under \`.scratch/<feature>/\`** unless the repo's remote is GitHub or GitLab. That keeps the whole flow self-contained.
- Record it in \`docs/agents/issue-tracker.md\`; that file is the precondition for \`spec\`. If the user wants the full upstream layout — triage labels, \`docs/agents/domain.md\`, the \`## Agent skills\` block in CLAUDE.md/AGENTS.md — ask them to run \`/setup-matt-pocock-skills\`, which is user-only.

## Main flow

1. **grill** — load \`grilling\` and \`domain-modeling\`, which together are what the user-facing \`/grill-with-docs\` runs. Interview until the frontier is empty: facts are yours to find, decisions are the user's. No code and no spec yet. Write terms into \`CONTEXT.md\` and hard-to-reverse choices into \`docs/adr/\` as they settle, but create those files lazily — with no new term and no such decision, write neither.

When a decision can be answered by picking one of two to four options, put it on a card with \`flow_ask\` instead of writing it as prose: at most three questions per call, each option one short line, the recommended one first. The user's submission arrives as their next message; record the settled decisions in \`.scratch/<feature>/decisions.md\` before advancing to \`spec\`.
2. **spec** — agree the test boundaries with the user first, then write \`.scratch/<feature>/spec.md\`: problem, solution, user stories, decisions, test boundaries, out of scope. Base it on the settled decisions; do not re-interview.
3. **tickets** — draft the breakdown, then put the granularity to the user before writing any file: how many tickets, and whether each one is small enough to finish in one fresh context window. Only after they agree, write \`.scratch/<feature>/issues/NN-slug.md\`. One vertical slice per ticket that leaves the product working, each declaring \`blocked-by:\`. When you write Chinese, name one ticket 任务单 and the stage 任务. Never write 拆票, 工单, or use 票 as shorthand — 工单 reads as a support ticket, and the other two are not words.
4. **implement** — one ticket per pass. Load \`tdd\`; work at the pre-agreed seams; typecheck and run that ticket's tests; no scope creep.
5. **review** — load \`code-review\` for both axes (Standards and Spec), then commit.

## Gates

\`flow_stage\` owns the phase. Call it with \`action: "status"\` before starting a phase, and \`action: "advance"\` only when that phase's exit criterion is true; it refuses skipped stages and missing artifacts. Stages: grill → spec → tickets → implement → review → done. There is no separate "idea" stage: a feature enters at \`grill\`, which is where the idea is sharpened.

Leaving \`grill\` for \`spec\` needs both the settled decisions in your evidence and \`docs/agents/issue-tracker.md\`. Without that file the step is refused; write it, defaulting to local markdown.

Keep grill → spec → tickets in one context window. Start each implement pass from the ticket, not from the previous pass.`

/**
 * Read the flow file, tolerating absence and partial writes.
 * @param {string} file absolute path of flow.json
 * @returns {Promise<object | null>} the stored state, or null when absent
 */
async function readState(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    if (error instanceof SyntaxError) return null
    throw error
  }
}

/**
 * Resolve the session working directory, preferring the owning service.
 * @param {object} ctx plugin context
 * @param {object} exec tool run context
 * @returns {string} absolute directory the feature root is anchored to
 */
function resolveCwd(ctx, exec) {
  const session = exec.agent?.session
  if (session) {
    const service = ctx.get('workingDirectory')
    if (service) {
      try {
        const resolved = service.get(session)
        if (typeof resolved === 'string' && resolved.length > 0) return resolved
      } catch {
        // fall through to the session header
      }
    }
    if (typeof session.cwd === 'string' && session.cwd.length > 0) return session.cwd
  }
  return process.cwd()
}

/**
 * Count the ticket files a feature owns.
 * @param {string} issuesDir absolute issues directory
 * @returns {Promise<number>} number of markdown tickets
 */
async function countTickets(issuesDir) {
  try {
    const entries = await readdir(issuesDir, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md')).length
  } catch (error) {
    if (error && error.code === 'ENOENT') return 0
    throw error
  }
}

/**
 * Whether a markdown artifact exists and carries real content.
 * @param {string} file absolute path
 * @param {number} minChars minimum trimmed length
 * @returns {Promise<boolean>} true when the file is substantive
 */
async function isFileReady(file, minChars) {
  try {
    const info = await stat(file)
    if (!info.isFile()) return false
    const text = await readFile(file, 'utf8')
    return text.trim().length >= minChars
  } catch (error) {
    if (error && error.code === 'ENOENT') return false
    throw error
  }
}

/**
 * Evaluate the exit criterion for entering a stage.
 * @param {string} target stage being entered
 * @param {string} cwd repository directory the session works in
 * @param {string} dir feature directory
 * @param {string} evidence model-supplied justification
 * @returns {Promise<{ready: boolean, requirement: string}>} whether the step is allowed, and what it needs
 */
async function checkGate(target, cwd, dir, evidence) {
  const said = evidence.trim()
  if (target === 'spec') {
    if (said.length < EVIDENCE_MIN_CHARS) {
      return { ready: false, requirement: '先拷问清楚：要做什么、不做什么、测试从哪一层切入' }
    }
    return (await isFileReady(join(cwd, TRACKER_DOC), TRACKER_MIN_CHARS))
      ? { ready: true, requirement: '决策已定，issue 记在哪也写进文档了' }
      : { ready: false, requirement: `先决定 issue 放在哪（本地 markdown 用 ${FEATURE_ROOT}/ 就行），写进 ${TRACKER_DOC}` }
  }
  if (target === 'tickets') {
    return (await isFileReady(join(dir, 'spec.md'), SPEC_MIN_CHARS))
      ? { ready: true, requirement: '规范已成文' }
      : { ready: false, requirement: `先把规范写进 ${join(dir, 'spec.md')}（至少 ${SPEC_MIN_CHARS} 字）` }
  }
  if (target === 'implement') {
    const count = await countTickets(join(dir, 'issues'))
    return count > 0
      ? { ready: true, requirement: '任务已拆成可独立完成的单子' }
      : { ready: false, requirement: `先把任务拆开，写进 ${join(dir, 'issues')}/` }
  }
  if (target === 'review') {
    return said.length >= EVIDENCE_MIN_CHARS
      ? { ready: true, requirement: '实现完成，类型检查和测试都跑过' }
      : { ready: false, requirement: '先做实现：类型检查和这个任务的测试都要跑通' }
  }
  if (target === 'done') {
    return said.length >= EVIDENCE_MIN_CHARS
      ? { ready: true, requirement: '评审通过，改动已提交' }
      : { ready: false, requirement: '先做评审：标准与规范两个维度都过一遍，再提交' }
  }
  return { ready: true, requirement: '没有前置条件' }
}

/**
 * Present the conditions for the next stages.
 * @param {string} stage current stage
 * @param {string} cwd repository directory the session works in
 * @param {string} dir feature directory
 * @returns {Promise<Array<{stage: string, ready: boolean, requirement: string}>>} one row per stage
 */
async function describeGates(stage, cwd, dir) {
  const rows = []
  // Every stage, not just the next two: the dock lets the user inspect any of
  // them, so the client needs each one's condition.
  for (const target of STAGES) {
    const gate = await checkGate(target, cwd, dir, '')
    rows.push({ stage: target, ready: gate.ready, requirement: gate.requirement })
  }
  return rows
}

/** Plain JSON Schema, because `defineTool` is not importable from this location. */
const TOOL_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'feature'],
  properties: {
    action: {
      type: 'string',
      enum: ['status', 'advance'],
      description: 'status reads the phase and the precondition for the next stages; advance moves it one stage (or back for rework).'
    },
    feature: {
      type: 'string',
      description: 'Feature slug: lowercase letters, digits and single hyphens, e.g. "checkout-retry".'
    },
    to: {
      type: 'string',
      enum: STAGES,
      description: 'Target stage for advance. Required when action is "advance".'
    },
    evidence: {
      type: 'string',
      description: 'What makes the current phase finished, in one sentence: the decision that was taken, or the checks that ran. This is shown to the user and kept in the history, so write it for a human, not as a status code.'
    }
  }
}

const TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['feature', 'stage', 'path', 'gates'],
  properties: {
    feature: { type: 'string' },
    stage: { type: 'string' },
    next: { type: 'string' },
    path: { type: 'string' },
    moved: { type: 'boolean' },
    gates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['stage', 'ready', 'requirement'],
        properties: {
          stage: { type: 'string' },
          ready: { type: 'boolean' },
          requirement: { type: 'string' }
        }
      }
    }
  }
}

/**
 * Build the flow_stage tool definition as a plain object.
 * @param {object} ctx plugin context
 * @returns {object} registry-ready tool definition
 */
function buildTool(ctx) {
  return {
    name: 'flow_stage',
    description:
      'Own the development phase of one feature and the precondition for each next stage. Call with action "status" before starting a phase, and action "advance" only once that phase is genuinely finished. Forward moves are one stage at a time; moving back for rework is allowed. Artifacts live under .scratch/<feature>/ (spec.md, issues/NN-slug.md, flow.json).',
    parameters: TOOL_PARAMETERS,
    output: {
      schema: TOOL_OUTPUT_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: `${value.feature}: ${value.stage}${value.next ? ` (next: ${value.next})` : ''}${value.moved ? ' — advanced' : ''}`
      }],
      // Carried into the tool result meta, where the `matt-flow` projection folds it
      // into the value the composer dock renders.
      presentationMeta: (_args, value) => ({
        tool: 'flow_stage',
        feature: value.feature,
        stage: value.stage,
        next: value.next ?? null,
        gates: value.gates,
      }),
    },
    async execute(args, exec) {
      const feature = String(args.feature ?? '').trim()
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(feature)) {
        throw new Error('invalid feature slug: use lowercase letters, digits and single hyphens')
      }

      const cwd = resolveCwd(ctx, exec)
      const root = join(cwd, FEATURE_ROOT, feature)
      const stateFile = join(root, 'flow.json')
      const state = await readState(stateFile)
      const stage = normalizeStage(state?.stage)

      if (args.action === 'status') {
        const next = STAGES[STAGES.indexOf(stage) + 1]
        return {
          feature,
          stage,
          ...(next ? { next } : {}),
          path: stateFile,
          gates: await describeGates(stage, cwd, root)
        }
      }

      const target = String(args.to ?? '').trim()
      if (!STAGES.includes(target)) throw new Error(`unknown target stage: ${target || '(none)'}`)

      const from = STAGES.indexOf(stage)
      const to = STAGES.indexOf(target)
      if (to === from) throw new Error(`feature is already at stage ${stage}`)
      if (to > from + 1) {
        throw new Error(`cannot skip stages: ${stage} → ${target}. Advance at most one stage at a time.`)
      }

      const evidence = String(args.evidence ?? '')
      let moved = false

      if (to > from) {
        const verdict = await checkGate(target, cwd, root, evidence)
        if (!verdict.ready) {
          throw new Error(`the precondition for ${target} is not met: ${verdict.requirement}`)
        }
        moved = true
      }

      const now = new Date().toISOString()
      const history = Array.isArray(state?.history) ? state.history : []
      history.push({ from: stage, to: target, at: now, evidence: evidence.trim() })

      await mkdir(root, { recursive: true })
      await writeFile(
        stateFile,
        JSON.stringify({ feature, stage: target, updatedAt: now, history }, null, 2) + '\n',
        'utf8'
      )

      const next = STAGES[to + 1]
      return {
        feature,
        stage: target,
        ...(next ? { next } : {}),
        path: stateFile,
        moved,
        gates: await describeGates(target, cwd, root)
      }
    }
  }
}

/** Options the decision card renders, one entry per choice. */
const ASK_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['feature', 'questions'],
  properties: {
    feature: {
      type: 'string',
      description: 'Feature slug this decision belongs to, matching flow_stage.'
    },
    questions: {
      type: 'array',
      description: 'One to three decisions to settle, each with two to four labelled options.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'options'],
        properties: {
          id: { type: 'string', description: 'Stable id, used in the recorded answer.' },
          title: { type: 'string', description: 'The decision, phrased as the question the user answers.' },
          detail: { type: 'string', description: 'Optional one-line context under the title.' },
          allowText: { type: 'boolean', description: 'Whether the card offers a free-text field. Defaults to true.' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label'],
              properties: {
                label: { type: 'string', description: 'Short option name, e.g. "A) Vite + TS + 原生 DOM".' },
                description: { type: 'string', description: 'One line on the tradeoff or consequence.' }
              }
            }
          }
        }
      }
    }
  }
}

const ASK_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['feature', 'questions', 'state'],
  properties: {
    feature: { type: 'string' },
    questions: { type: 'integer' },
    state: { type: 'string' }
  }
}

/**
 * Build the flow_ask tool: it hands the decision to the card and ends the turn.
 * @returns {object} registry-ready tool definition
 */
function buildAskTool() {
  return {
    name: 'flow_ask',
    description:
      'Ask the user to settle up to three decisions. Renders an interactive card in the conversation with selectable options and a free-text field; the user submits one batch, which arrives as their next message. Use it in the grill phase instead of writing the questions as prose. This tool does not wait: end your turn after calling it. Chinese wording inside the card: one ticket is 任务单 and the stage is 任务; never write 拆票, 工单, or 票 as shorthand.',
    parameters: ASK_PARAMETERS,
    output: {
      schema: ASK_OUTPUT_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: `决策卡已显示：${value.feature}，${value.questions} 个问题待选择`
      }]
    },
    async execute(args) {
      const feature = String(args.feature ?? '').trim()
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(feature)) {
        throw new Error('invalid feature slug: use lowercase letters, digits and single hyphens')
      }
      const questions = Array.isArray(args.questions) ? args.questions : []
      if (questions.length === 0) throw new Error('flow_ask needs at least one question')
      if (questions.length > 3) throw new Error('ask at most three questions at a time')
      for (const question of questions) {
        const options = Array.isArray(question?.options) ? question.options : []
        if (options.length < 2) throw new Error(`question "${question?.title ?? ''}" needs at least two options`)
        if (options.length > 4) throw new Error(`question "${question?.title ?? ''}" allows at most four options`)
      }
      mark(APPLY_LOG, `flow_ask served ${feature} with ${questions.length} question(s)`)
      return {
        feature,
        questions: questions.length,
        state: 'card rendered in the conversation; wait for the user to submit their choices'
      }
    }
  }
}

/** Where the skills CLI installs user-level skills on this machine. */
function skillsHome() {
  const agents = process.env.DSH_AGENTS_HOME || join(homedir(), '.agents')
  return join(agents, 'skills')
}

/**
 * Which required skills are already on disk.
 * @returns {{present: string[], missing: string[]}} split by availability
 */
function skillPresence() {
  const dir = skillsHome()
  const present = []
  const missing = []
  for (const name of REQUIRED_SKILLS) {
    if (existsSync(join(dir, name, 'SKILL.md'))) present.push(name)
    else missing.push(name)
  }
  return { present, missing }
}

/** Last bootstrap attempt, or an empty record. */
function readBootstrap() {
  try {
    const parsed = JSON.parse(readFileSync(BOOTSTRAP_STATE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Persist one bootstrap record, tolerating a read-only home. */
function writeBootstrap(record) {
  try {
    mkdirSync(join(homedir(), '.dsh'), { recursive: true })
    writeFileSync(BOOTSTRAP_STATE, JSON.stringify(record, null, 2) + '\n', 'utf8')
  } catch (error) {
    mark(APPLY_LOG, `bootstrap state write failed: ${error && error.message}`)
  }
}

/** The tail of the install log, for the model to report. */
function bootstrapLogTail(lines = 12) {
  try {
    const text = readFileSync(BOOTSTRAP_LOG, 'utf8')
    return text.trim().split('\n').slice(-lines).join('\n')
  } catch {
    return ''
  }
}

/**
 * Run the skills CLI install. A GUI-launched Host often has a minimal PATH, so a
 * direct `npx` attempt falls back to the user's login shell.
 * @param {string} command the CLI invocation
 * @param {boolean} viaShell whether to run it through the login shell
 * @param {string[]} args argv for the direct form
 * @returns {import('node:child_process').ChildProcess} the spawned install
 */
function spawnInstall(command, viaShell, args) {
  let fd = 'ignore'
  try {
    fd = openSync(BOOTSTRAP_LOG, 'a')
  } catch {
    fd = 'ignore'
  }
  let child
  if (viaShell) {
    // A GUI-launched Host inherits a minimal PATH, so resolving `npx` may need
    // the user's shell. The flags differ per platform: POSIX reads rc files with
    // `-lc`, while cmd.exe needs /d /s /c and PowerShell needs -Command.
    if (process.platform === 'win32') {
      const shell = process.env.ComSpec || 'cmd.exe'
      child = spawn(shell, ['/d', '/s', '/c', command], { stdio: ['ignore', fd, fd], windowsHide: true })
    } else {
      child = spawn(process.env.SHELL || '/bin/zsh', ['-lc', command], { stdio: ['ignore', fd, fd] })
    }
  } else {
    child = spawn(command, args, { stdio: ['ignore', fd, fd], windowsHide: true, shell: false })
  }
  return child
}

/**
 * Make sure the skill suite exists, installing it in the background when absent.
 * Non-blocking: callers get the current state immediately.
 * @param {{force?: boolean}} [options] retry even inside the backoff window
 * @returns {{state: string, present: string[], missing: string[], log: string, error?: string}} status
 */
function ensureSkills(options = {}) {
  const force = options.force === true
  const { present, missing } = skillPresence()
  if (missing.length === 0) {
    const previous = readBootstrap()
    if (previous.state !== 'ok') writeBootstrap({ state: 'ok', checkedAt: Date.now() })
    return { state: 'present', present, missing, log: '' }
  }

  const previous = readBootstrap()
  const startedAt = Number(previous.attemptedAt) || 0
  const stillRunning = previous.state === 'installing' && Date.now() - startedAt < INSTALL_TIMEOUT_MS + 60_000
  if (!force && stillRunning) {
    return { state: 'installing', present, missing, log: BOOTSTRAP_LOG }
  }
  if (!force && previous.state === 'failed' && Date.now() - startedAt < RETRY_AFTER_MS) {
    return { state: 'failed', present, missing, log: BOOTSTRAP_LOG, error: previous.error || 'install failed' }
  }

  writeBootstrap({ state: 'installing', attemptedAt: Date.now(), missing })
  mark(APPLY_LOG, `installing skills: ${missing.join(', ')}`)

  let settled = false
  let retried = false
  let child = null
  const timer = setTimeout(() => {
    try { child.kill('SIGTERM') } catch { /* already gone */ }
    finishFailed('install timed out')
  }, INSTALL_TIMEOUT_MS)
  if (typeof timer.unref === 'function') timer.unref()

  /** Record a terminal failure once. */
  function finishFailed(error) {
    if (settled) return
    settled = true
    clearTimeout(timer)
    writeBootstrap({ state: 'failed', attemptedAt: Date.now(), error })
    mark(APPLY_LOG, `skills install failed: ${error}`)
  }

  /** Record the outcome of a finished install by re-checking the skills on disk. */
  function finishFromExit(code) {
    if (settled) return
    const after = skillPresence()
    if (after.missing.length === 0) {
      settled = true
      clearTimeout(timer)
      writeBootstrap({ state: 'ok', finishedAt: Date.now() })
      mark(APPLY_LOG, 'skills installed')
      return
    }
    finishFailed(`exit ${code}; still missing: ${after.missing.join(', ')}`)
  }

  /**
   * Start one attempt. A GUI-launched Host often has a minimal PATH, so a direct
   * `npx` failure retries once through the user's login shell.
   */
  function launch(viaShell) {
    const argv = ['-y', 'skills@latest', 'add', SKILLS_PACKAGE, '-g', '-s', '*', '-y']
    // Creating symlinks needs elevation on Windows, so ask the CLI to copy there.
    if (process.platform === 'win32') argv.push('--copy')
    const line = `${NPX} ${argv.join(' ')}`
    let attempt
    try {
      attempt = viaShell
        ? spawnInstall(line, true, [])
        : spawnInstall(NPX, false, argv)
    } catch (error) {
      finishFailed(String(error && error.message))
      return
    }
    if (!attempt) return
    child = attempt
    attempt.on('error', (error) => {
      if (!retried && !viaShell) {
        retried = true
        mark(APPLY_LOG, `direct npx failed (${error && error.message}); retrying through the login shell`)
        launch(true)
        return
      }
      finishFailed(String(error && error.message))
    })
    attempt.on('exit', (code) => finishFromExit(code))
  }

  launch(false)
  return { state: 'installing', present, missing, log: BOOTSTRAP_LOG }
}

/** Build the flow_skills tool: report or retry the suite install. */
function buildSkillsTool() {
  return {
    name: 'flow_skills',
    description:
      'Report whether the Matt Pocock skill suite is installed, and retry its installation when it is missing. The workflow preset installs the suite automatically on first use; call this with action "status" to see what happened, or "install" to retry after a network or PATH failure.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'install'],
          description: 'status reads the current state; install attempts the CLI install again.'
        }
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['state', 'present', 'missing'],
        properties: {
          state: { type: 'string' },
          present: { type: 'array', items: { type: 'string' } },
          missing: { type: 'array', items: { type: 'string' } },
          log: { type: 'string' },
          error: { type: 'string' }
        }
      },
      render: (_args, value) => [{
        type: 'text',
        text: `skills: ${value.state} (${value.present.length} present${value.missing.length ? `, missing ${value.missing.join(', ')}` : ''})`
      }]
    },
    async execute(args) {
      const result = ensureSkills({ force: args.action === 'install' })
      return {
        state: result.state,
        present: result.present,
        missing: result.missing,
        log: bootstrapLogTail(),
        ...(result.error ? { error: result.error } : {}),
      }
    }
  }
}

/**
 * Schema surface the projection registry calls (`parse` only). The value is
 * produced by this plugin, so the check guards against corruption rather than
 * untrusted input.
 */
const FLOW_VIEW_SCHEMA = {
  parse(value) {
    if (value === null || value === undefined) return null
    if (typeof value !== 'object') throw new Error('matt-flow projection: expected an object or null')
    if (typeof value.feature !== 'string' || typeof value.stage !== 'string') {
      throw new Error('matt-flow projection: feature and stage must be strings')
    }
    return value
  }
}

/**
 * The first text block of a tool result message, or an empty string.
 * @param {object} message tool result message
 * @returns {string} its first text block
 */
function firstTextBlock(message) {
  const content = message && Array.isArray(message.content) ? message.content : []
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') return block.text
  }
  return ''
}

/** Internal fold state: the last known flow plus the call awaiting its result. */
const FLOW_STATE_SCHEMA = {
  parse(value) {
    if (!value || typeof value !== 'object') throw new Error('matt-flow state: expected an object')
    const flow = value.flow ?? null
    if (flow !== null && (typeof flow.feature !== 'string' || typeof flow.stage !== 'string')) {
      throw new Error('matt-flow state: flow must carry feature and stage')
    }
    return { pendingCallId: typeof value.pendingCallId === 'string' ? value.pendingCallId : null, flow }
  }
}

/** Folds the latest flow_stage result into one client-readable value. */
const FLOW_PROJECTION = {
  key: 'matt-flow',
  stateSchema: FLOW_STATE_SCHEMA,
  stateVersion: 2,
  init: () => ({ pendingCallId: null, flow: null }),
  apply: (state, event) => {
    // Pair the call first: only a flow_stage callId may consume the next result,
    // so unrelated tool output can never be mistaken for workflow state.
    if (event.type === 'tool/call') {
      const data = event.data || {}
      if (data.name !== 'flow_stage' || typeof data.callId !== 'string') return state
      return { pendingCallId: data.callId, flow: state.flow }
    }
    if (event.type !== 'tool/result') return state

    const data = event.data || {}
    const message = data.message || {}
    if (state.pendingCallId === null || message.toolCallId !== state.pendingCallId) return state

    const meta = data.meta || {}
    let payload = meta.tool === 'flow_stage'
      ? meta
      : (meta.presentation && meta.presentation.tool === 'flow_stage' ? meta.presentation : null)

    // Results recorded before presentationMeta existed still carry
    // "<feature>: <stage>" as their rendered text; fold those too so an
    // upgraded profile lights the bar from history.
    if (!payload) {
      const match = /^([a-z0-9][a-z0-9-]{0,63}): ([a-z]+)\b/.exec(firstTextBlock(message))
      if (!match) return { pendingCallId: null, flow: state.flow }
      payload = { feature: match[1], stage: match[2], gates: [] }
    }

    const stage = normalizeStage(payload.stage)
    const index = STAGES.indexOf(stage)
    return {
      pendingCallId: null,
      flow: {
        feature: payload.feature,
        stage,
        next: payload.next ?? (STAGES[index + 1] ?? null),
        gates: Array.isArray(payload.gates) ? payload.gates : [],
      },
    }
  },
  wire: {
    viewSchema: FLOW_VIEW_SCHEMA,
    view: (state) => state.flow,
  },
}

export function apply(ctx, config) {
  mark(APPLY_LOG, `apply entered v${PLUGIN_VERSION}`)

  // The same package mounts twice: a top-level row exists only so the client
  // boot graph can compose `dsh.client`, and it must not touch session
  // behaviour; the preset row does the real work.
  if (config && config.uiOnly === true) {
    mark(APPLY_LOG, 'uiOnly row: host behaviour skipped')
    return
  }

  const tools = ctx.get('tools')
  if (!tools || typeof tools.register !== 'function') {
    mark(APPLY_LOG, 'no tools service; nothing registered')
    return
  }

  const projections = ctx.get('sessionProjections')
  if (projections && typeof projections.register === 'function') {
    try {
      ctx.effect(() => projections.register(FLOW_PROJECTION))
      mark(APPLY_LOG, 'matt-flow projection registered')
    } catch (error) {
      mark(APPLY_LOG, `projection registration failed: ${error && error.message}`)
    }
  } else {
    mark(APPLY_LOG, 'no sessionProjections service; dock state unavailable')
  }

  const prompt = ctx.get('systemPrompt')
  if (prompt && typeof prompt.section === 'function') {
    ctx.effect(() => prompt.section({ name: 'matt-flow', order: 100, text: FLOW_SECTION }))
    mark(APPLY_LOG, 'prompt section registered')
  } else {
    mark(APPLY_LOG, 'no systemPrompt service; prompt section skipped')
  }

  ctx.effect(() => tools.register(buildTool(ctx)))
  ctx.effect(() => tools.register(buildAskTool()))
  ctx.effect(() => tools.register(buildSkillsTool()))
  mark(APPLY_LOG, 'flow_stage, flow_ask and flow_skills registered')

  // Install the suite when it is absent, without blocking startup. The skills
  // provider watches its roots, so a successful install reaches the catalog
  // without a restart.
  try {
    const boot = ensureSkills()
    mark(APPLY_LOG, `skills bootstrap: ${boot.state}${boot.missing.length ? ` (missing ${boot.missing.join(', ')})` : ''}`)
  } catch (error) {
    mark(APPLY_LOG, `skills bootstrap threw: ${error && error.message}`)
  }
}
