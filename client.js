/**
 * Browser half of dsh-matt-flow: renders a `flow_ask` tool call as a decision
 * card (options + free text per question) and submits the answers as the user's
 * next message.
 *
 * No DSH package is imported: React comes from the browser module table, and the
 * composer is driven through the slot's own `inputActions`. Styling uses the
 * host theme tokens (`--dsw-alias-*`) so the card follows light and dark themes.
 */
window.__ModuleLoader__.load({
  id: 'dsh-matt-flow',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const CSS = `
.mf-card { display:flex; flex-direction:column; gap:18px; padding:16px 18px; box-sizing:border-box;
  border:1px solid var(--dsw-alias-border-l1); border-radius:14px; background:var(--dsw-alias-bg-layer-1);
  font-size:13px; line-height:1.5; color:var(--dsw-alias-label-primary); }
.mf-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.mf-kicker { font-size:12px; color:var(--dsw-alias-label-secondary); }
.mf-progress { font-size:12px; color:var(--dsw-alias-label-secondary); font-variant-numeric:tabular-nums; }
.mf-q { display:flex; flex-direction:column; gap:9px; }
.mf-title { font-size:14px; font-weight:600; line-height:1.45; }
.mf-detail { font-size:12px; color:var(--dsw-alias-label-secondary); margin-top:-3px; }
.mf-options { display:flex; flex-direction:column; gap:7px; }
.mf-opt { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; cursor:pointer; user-select:none;
  border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:transparent;
  transition:background 120ms ease, border-color 120ms ease; }
.mf-opt:hover { background:var(--dsw-alias-bg-layer-2); }
.mf-opt:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:1px; }
.mf-opt[data-on='1'] { border-color:var(--dsw-alias-brand-primary);
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); }
.mf-dot { flex:none; width:16px; height:16px; margin-top:1px; border-radius:50%;
  border:1.5px solid var(--dsw-alias-border-l2); display:flex; align-items:center; justify-content:center; }
.mf-dot i { width:8px; height:8px; border-radius:50%; background:var(--dsw-alias-brand-primary); display:none; }
.mf-opt[data-on='1'] .mf-dot { border-color:var(--dsw-alias-brand-primary); }
.mf-opt[data-on='1'] .mf-dot i { display:block; }
.mf-body { display:flex; flex-direction:column; gap:2px; min-width:0; }
.mf-label { font-size:13.5px; font-weight:500; line-height:1.45; }
.mf-desc { font-size:12px; color:var(--dsw-alias-label-secondary); }
.mf-input { width:100%; box-sizing:border-box; padding:8px 11px; font:inherit; font-size:13px;
  color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l1); border-radius:10px; outline:none;
  transition:border-color 120ms ease; }
.mf-input::placeholder { color:var(--dsw-alias-label-secondary); }
.mf-input:focus { border-color:var(--dsw-alias-brand-primary); }
.mf-foot { display:flex; align-items:center; gap:12px; }
.mf-send { padding:8px 18px; font:inherit; font-size:13px; font-weight:500; color:#fff;
  background:var(--dsw-alias-brand-primary); border:none; border-radius:10px; cursor:pointer;
  transition:opacity 120ms ease; }
.mf-send:hover:enabled { opacity:.9; }
.mf-send:disabled { opacity:.45; cursor:default; }
.mf-hint { font-size:12px; color:var(--dsw-alias-label-secondary); }
.mf-plain { white-space:pre-wrap; word-break:break-word; font-size:12px; margin:0;
  color:var(--dsw-alias-label-secondary); }
.mf-diag { font-size:12px; color:var(--dsw-alias-label-secondary); }
.mf-diag summary { cursor:pointer; }
.mf-chip-wrap { position:relative; display:inline-flex; }
.mf-chip { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 9px; font:inherit;
  font-size:12px; color:var(--dsw-alias-label-primary); background:transparent; cursor:pointer;
  border:1px solid var(--dsw-alias-border-l1); border-radius:999px;
  transition:border-color 120ms ease, background 120ms ease; }
.mf-chip:hover, .mf-chip[data-open='1'] { border-color:var(--dsw-alias-brand-primary);
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent); }
.mf-chip-dot { position:relative; width:22px; height:3px; border-radius:999px; overflow:hidden;
  background:var(--dsw-alias-border-l1); }
.mf-chip-dot > span { position:absolute; inset:0 auto 0 0; display:block;
  background:var(--dsw-alias-brand-primary); }
.mf-chip-label { white-space:nowrap; }
.mf-chip-count { color:var(--dsw-alias-label-secondary); font-variant-numeric:tabular-nums; }
.mf-pop { position:absolute; left:0; bottom:calc(100% + 8px); z-index:30; width:292px; box-sizing:border-box;
  display:flex; flex-direction:column; gap:8px; padding:12px 14px; font-size:12px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:var(--dsw-radius-lg);
  background:var(--dsw-alias-bg-overlay); box-shadow:var(--dsw-elevation-panel); }
.mf-pop-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.mf-pop-feature { color:var(--dsw-alias-label-primary); font-weight:600; }
.mf-pop-count { color:var(--dsw-alias-label-secondary); font-variant-numeric:tabular-nums; }
.mf-pop-track { height:3px; border-radius:999px; overflow:hidden; background:var(--dsw-alias-border-l1); }
.mf-pop-fill { display:block; height:100%; background:var(--dsw-alias-brand-primary); }
.mf-pop-steps { display:flex; flex-wrap:nowrap; gap:1px; }
.mf-pop-step { padding:2px 6px; font:inherit; font-size:12px; white-space:nowrap; background:transparent; border:1px solid transparent;
  border-radius:999px; color:var(--dsw-alias-label-secondary); white-space:nowrap; cursor:pointer;
  transition:background 120ms ease, border-color 120ms ease; }
.mf-pop-step:hover { border-color:var(--dsw-alias-border-l1); color:var(--dsw-alias-label-primary); }
.mf-pop-step[data-picked='1'] { border-color:var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); }
.mf-pop-step[data-done='1'] { color:var(--dsw-alias-label-primary); }
.mf-pop-step[data-on='1'] { color:var(--dsw-alias-brand-primary); font-weight:600;
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.mf-pop-gate { color:var(--dsw-alias-label-secondary); line-height:1.5; }
.mf-pop-doc { color:var(--dsw-alias-label-primary); line-height:1.6; }
.mf-pop-gate[data-blocked='1'] { color:var(--dsw-alias-state-warn-primary); }
.mf-pop-next { display:flex; align-items:center; gap:8px; color:var(--dsw-alias-label-secondary); }
.mf-pop-cmd { font-family:var(--dsw-font-mono, ui-monospace, monospace); padding:1px 6px; border-radius:6px;
  border:1px solid var(--dsw-alias-border-l1); color:var(--dsw-alias-label-primary); }
.mf-action { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; font:inherit; font-size:12px;
  border:1px solid var(--dsw-alias-border-l1); border-radius:8px; background:transparent;
  color:var(--dsw-alias-label-primary); cursor:pointer; transition:border-color 120ms ease, color 120ms ease; }
.mf-action:hover { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); }
`

    /** Compact, bounded rendering of an unknown value for the diagnostic block. */
    function safeText(value) {
      if (value === undefined) return '(undefined)'
      if (value === null) return '(null)'
      if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value
      try {
        const text = JSON.stringify(value)
        return text && text.length > 300 ? `${text.slice(0, 300)}…` : String(text)
      } catch {
        return '(unserializable)'
      }
    }

    /** One candidate value as an object; the wire also carries the call as a JSON string. */
    function asObject(value) {
      if (typeof value === 'function') {
        try { value = value() } catch { return null }
      }
      if (typeof value === 'string') {
        try { value = JSON.parse(value) } catch { return null }
      }
      return value && typeof value === 'object' ? value : null
    }

    /**
     * The call arguments live in different places per phase: `args` on a started
     * call, `argsRaw` (a JSON string) on a settled one. Try every carrier and
     * keep the first that actually holds questions.
     */
    function readArgs(props) {
      const block = (props && props.block) || {}
      const candidates = [
        props && props.args,
        block.args,
        block.argsRaw,
        block.call && block.call.args,
        block.call && block.call.argsRaw,
      ]
      let lastObject = null
      for (const candidate of candidates) {
        const parsed = asObject(candidate)
        if (!parsed) continue
        if (Array.isArray(parsed.questions) && parsed.questions.length > 0) return parsed
        lastObject = lastObject || parsed
      }
      return lastObject
    }

    /** The answer message the card submits. */
    function compose(questions, chosen, notes) {
      const lines = []
      questions.forEach((question, index) => {
        const label = chosen[index]
        const note = (notes[index] || '').trim()
        const picked = label ? `${index + 1}) ${question.title}: ${label}` : `${index + 1}) ${question.title}: （未选）`
        lines.push(note ? `${picked} — 补充：${note}` : picked)
      })
      return lines.join('\n')
    }

    /**
     * A single-select row that can also be cleared: a native radio cannot be
     * unchecked, and a decision card needs a way back to "no answer".
     */
    function Option({ checked, disabled, label, description, onToggle }) {
      const toggle = () => { if (!disabled) onToggle(label) }
      return h('div', {
        className: 'mf-opt',
        role: 'radio',
        'aria-checked': checked ? 'true' : 'false',
        'aria-disabled': disabled ? 'true' : 'false',
        tabIndex: disabled ? -1 : 0,
        'data-on': checked ? '1' : '0',
        onClick: toggle,
        onKeyDown: (event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            toggle()
          }
        },
      }, [
        h('span', { key: 'dot', className: 'mf-dot' }, h('i', null)),
        h('span', { key: 'body', className: 'mf-body' }, [
          h('span', { key: 'label', className: 'mf-label' }, label),
          description ? h('span', { key: 'desc', className: 'mf-desc' }, description) : null,
        ]),
      ])
    }

    function FlowAskCard(props) {
      const block = props.block
      const inputActions = props.inputActions
      const args = readArgs(props)
      const questions = Array.isArray(args && args.questions) ? args.questions : []
      const [chosen, setChosen] = React.useState({})
      const [notes, setNotes] = React.useState({})
      const [sent, setSent] = React.useState(false)

      if (questions.length === 0) {
        const preparing = block && block.phase === 'preparing'
        return h('div', { className: 'mf-card' }, [
          h('style', { key: 'css' }, CSS),
          h('div', { key: 'note', className: 'mf-kicker' },
            preparing ? '决策卡准备中…' : '决策卡参数读取失败，请直接回复选项。'),
          preparing ? null : h('details', { key: 'diag', className: 'mf-diag' }, [
            h('summary', { key: 'sum' }, '诊断信息'),
            h('pre', { key: 'pre', className: 'mf-plain' }, [
              `block keys: ${block ? Object.keys(block).join(', ') : '(no block)'}`,
              `phase: ${block && block.phase ? block.phase : '(none)'}`,
              `args: ${safeText(block && block.args)}`,
              `argsRaw: ${safeText(block && block.argsRaw)}`,
              `call: ${safeText(block && block.call)}`,
            ].join('\n')),
          ]),
        ])
      }

      const answered = questions.filter((_, index) => Boolean(chosen[index])).length
      const canSend = !sent && typeof inputActions?.setDraft === 'function' && typeof inputActions?.submit === 'function'

      const send = () => {
        if (!canSend) return
        inputActions.setDraft(compose(questions, chosen, notes))
        inputActions.submit()
        setSent(true)
      }

      return h('div', { className: 'mf-card' }, [
        h('style', { key: 'css' }, CSS),
        h('div', { key: 'head', className: 'mf-head' }, [
          h('span', { key: 'kicker', className: 'mf-kicker' }, '待决事项'),
          h('span', { key: 'progress', className: 'mf-progress' }, sent ? '已提交' : `已选 ${answered}/${questions.length}`),
        ]),
        ...questions.map((question, index) => h('div', {
          key: question.id || String(index),
          className: 'mf-q',
        }, [
          h('div', { key: 'title', className: 'mf-title' }, question.title),
          question.detail ? h('div', { key: 'detail', className: 'mf-detail' }, question.detail) : null,
          h('div', { key: 'options', className: 'mf-options', role: 'radiogroup' },
            (Array.isArray(question.options) ? question.options : []).map((option) => h(Option, {
              key: option.label,
              label: option.label,
              description: option.description,
              checked: chosen[index] === option.label,
              disabled: sent,
              onToggle: (label) => setChosen((prev) => ({ ...prev, [index]: prev[index] === label ? undefined : label })),
            }))),
          h('input', {
            key: 'note',
            className: 'mf-input',
            type: 'text',
            value: notes[index] || '',
            disabled: sent,
            placeholder: question.allowText === false ? '本题无需补充' : '补充说明或自定义选项（可留空）',
            onChange: (event) => setNotes((prev) => ({ ...prev, [index]: event.target.value })),
          }),
        ])),
        h('div', { key: 'foot', className: 'mf-foot' }, [
          h('button', { key: 'send', className: 'mf-send', type: 'button', onClick: send, disabled: !canSend },
            sent ? '已提交' : '提交选择'),
          sent
            ? h('span', { key: 'hint', className: 'mf-hint' }, '已作为你的回复发出')
            : canSend
              ? h('span', { key: 'hint', className: 'mf-hint' }, '再点一次可取消选择；未选的题记为「未选」')
              : h('span', { key: 'nohint', className: 'mf-hint' }, '当前环境没有输入动作，请直接回复选项'),
        ]),
        canSend || sent
          ? null
          : h('pre', { key: 'fallback', className: 'mf-plain' }, compose(questions, chosen, notes)),
      ])
    }

    /**
     * The per-feature ladder. `setup` is deliberately absent: it runs once per
     * repository, not once per feature, so it would read as a step that never
     * advances again.
     */
    const STAGES = [
      { id: 'grill', label: '拷问' },
      { id: 'spec', label: '规范' },
      { id: 'tickets', label: '任务' },
      { id: 'implement', label: '实现' },
      { id: 'review', label: '评审' },
      { id: 'done', label: '收尾' },
    ]

    /** The user-side command that carries each stage forward. */
    /** The command that runs a given stage, keyed by the stage it produces. */
    const ENTER_COMMAND = {
      grill: '/grill-with-docs',
      spec: '/to-spec',
      tickets: '/to-tickets',
      implement: '/implement',
      review: '/code-review',
      done: null,
    }

    /**
     * What each stage is for. Written here rather than read from the log so the
     * popover never shows a stale sentence recorded by an older version.
     */
    const STAGE_DOC = {
      grill: '约定决策和术语',
      spec: '约定问题、方案、用户故事、决策、测试边界、范围',
      tickets: '约定粒度，拆成可独立验证的任务清单',
      implement: '使用 TDD 的方式实现',
      review: '核验是否符合项目惯例和新增规范',
      done: '结束本轮变更',
    }

    /** Read the projection without assuming hooks exist (older slots omit them). */
    /** Legacy logs recorded the retired pre-grill stages; fold them onto the first one. */
    const STAGE_ALIASES = { setup: 'grill', idea: 'grill' }

    /** Chinese label for a stage id, falling back to the id itself. */
    function stageLabel(id) {
      const found = STAGES.find((stage) => stage.id === id)
      return found ? found.label : id
    }

    function useFlow(useProjection) {
      if (typeof useProjection !== 'function') return null
      const value = useProjection('matt-flow')
      if (!value || typeof value !== 'object' || typeof value.stage !== 'string') return null
      return { ...value, stage: STAGE_ALIASES[value.stage] ?? value.stage }
    }

    /**
     * The preset this session runs. The client bundle is a top-level package, so
     * its slot entries exist in every session; this gate keeps the workflow UI
     * inside the preset that owns it.
     */
    function useSessionPreset(props) {
      const useSessions = props.useSessions
      if (typeof useSessions !== 'function' || typeof props.sessionId !== 'string') return undefined
      return useSessions((state) => state.byId[props.sessionId]?.projectionValues?.agentPreset)
    }

    function StageChip(props) {
      const preset = useSessionPreset(props)
      const flow = useFlow(props.useProjection)
      const [open, setOpen] = React.useState(false)
      const [picked, setPicked] = React.useState(null)
      const box = React.useRef(null)

      React.useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          if (box.current && !box.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      if (preset !== undefined && preset !== 'matt-flow') return null
      if (!flow) return null
      const currentIndex = STAGES.findIndex((stage) => stage.id === flow.stage)
      if (currentIndex < 0) return null

      const stage = STAGES[currentIndex]
      // Open on the stage the feature is actually in; the pills let you look ahead.
      const pickedIndex = typeof picked === 'number' && picked >= 0 && picked < STAGES.length ? picked : currentIndex
      const pickedStage = STAGES[pickedIndex]
      const isCurrent = pickedIndex === currentIndex
      const isPast = pickedIndex < currentIndex
      const pickedCommand = ENTER_COMMAND[pickedStage?.id] ?? null
      const percent = Math.round((currentIndex / (STAGES.length - 1)) * 100)

      return h('span', { className: 'mf-chip-wrap', ref: box }, [
        h('style', { key: 'css' }, CSS),
        h('button', {
          key: 'chip',
          type: 'button',
          className: 'mf-chip',
          'data-open': open ? '1' : '0',
          'aria-expanded': open ? 'true' : 'false',
          title: `${flow.feature} · ${stage.label} ${currentIndex + 1}/${STAGES.length}`,
          onClick: () => {
            if (!open) setPicked(null)
            setOpen(!open)
          },
        }, [
          h('span', { key: 'dot', className: 'mf-chip-dot' },
            h('span', { key: 'fill', style: { width: `${percent}%` } })),
          h('span', { key: 'label', className: 'mf-chip-label' }, stage.label),
          h('span', { key: 'count', className: 'mf-chip-count' }, `${currentIndex + 1}/${STAGES.length}`),
        ]),
        open
          ? h('div', { key: 'pop', className: 'mf-pop', role: 'dialog' }, [
            h('div', { key: 'head', className: 'mf-pop-head' }, [
              h('span', { key: 'feature', className: 'mf-pop-feature' }, flow.feature),
              h('span', { key: 'count', className: 'mf-pop-count' }, `${currentIndex + 1}/${STAGES.length}`),
            ]),
            h('span', { key: 'track', className: 'mf-pop-track' },
              h('span', { key: 'fill', className: 'mf-pop-fill', style: { width: `${percent}%` } })),
            h('div', { key: 'steps', className: 'mf-pop-steps', role: 'tablist' },
              STAGES.map((item, index) => h('button', {
                key: item.id,
                type: 'button',
                role: 'tab',
                'aria-selected': index === pickedIndex ? 'true' : 'false',
                className: 'mf-pop-step',
                'data-on': index === currentIndex ? '1' : '0',
                'data-done': index < currentIndex ? '1' : '0',
                'data-picked': index === pickedIndex ? '1' : '0',
                onClick: () => setPicked(index),
              }, item.label))),
            h('div', {
              key: 'status',
              className: 'mf-pop-gate',
            }, isCurrent ? '当前阶段' : isPast ? '已通过' : '未开始'),
            h('div', { key: 'doc', className: 'mf-pop-doc' }, STAGE_DOC[pickedStage?.id] ?? ''),
            pickedCommand
              ? h('div', { key: 'next', className: 'mf-pop-next' }, [
                h('span', { key: 'text' }, '进入命令'),
                h('span', { key: 'cmd', className: 'mf-pop-cmd' }, pickedCommand),
              ])
              : null,
          ])
          : null,
      ])
    }


    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview',
          key: 'flow_ask',
        }, FlowAskCard))
        ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'matt-flow-stage',
          order: 50,
        }, StageChip))
      },
    }
  },
})
