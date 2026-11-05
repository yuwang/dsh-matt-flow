# dsh-matt-flow

把本机 `~/.agents/skills` 里的 [Matt Pocock Agent Skills](https://github.com/mattpocock/skills) 套件，编成一条**带前置条件的开发工作流**，作为 DSH 的一个 agent 预设。

它不复制、不改写任何技能；`npx skills update` 之后行为自动跟随上游。

## 它提供什么

一个 bundle，三层内容：

| 组成 | 作用 |
|---|---|
| `preset-matt` | 新增一个 agent 预设 `matt-flow`，插件集即官方 `standard` 预设 + 本包的 `matt-flow` 插件。在新建会话的预设选择器里出现。 |
| 系统提示词段落 `matt-flow` | 告诉模型：哪些技能它能自己 `skill` 加载（`grilling`/`tdd`/`code-review`/`diagnosing-bugs`…），哪些只能由你 `/命令` 触发（`/to-spec`、`/to-tickets`…），以及 拷问 → 规范 → 任务 → 实现 → 评审 → 收尾 的顺序、每阶段该做什么。 |
| 工具 `flow_stage` | 记录并推进某个 feature 的阶段，落盘到 `.scratch/<feature>/flow.json`。前进必须逐级、且要满足前置条件；回退（返工）允许。 |
| 工具 `flow_ask` + 决策卡（`client.js`） | 拷问阶段把决策做成对话里的卡片：每题一组选项加一个补充输入框，一次最多三题。点「提交选择」后，答案作为你的下一条消息发出，模型接着往下走。卡片由本包自己的浏览器模块渲染，**不依赖 dsh-genui**。 |
| 阶段胶囊（`client.js`） | 输入框工具行左侧的小胶囊：当前阶段、进度、下一阶段的前置条件。点开浮层看完整流程。只在 Matt 预设的会话里出现。 |

### 一个包，两行挂载

浏览器侧代码只能从**顶层** Loader 条目聚合，而宿主行为必须留在**预设子树**里（否则会污染所有会话）。同一个包因此挂两次：

- 顶层 `matt-flow-ui` 行：只为让浏览器扫描到 `dsh.client`，它的 config 是 `uiOnly: true`，`apply()` 立刻返回，不注册任何东西
- 预设里 `matt-flow` 行：真正的工作（提示词、三个工具、投影）

这就是插件页只显示一个条目的原因。


## 模式说明

**它是什么**

一条带前置条件的开发工作流。每个 feature 走同一条路：拷问 → 规范 → 任务 → 实现 → 评审 → 收尾。每一步做完，才能进下一步；跳级会被 `flow_stage` 拒绝。

它不是新的 AI 能力，而是把 Matt Pocock 那套技能串成有顺序、有产出的流程——技能本身仍然从 `~/.agents/skills` 读取，插件只负责编排。

**什么时候用它**

- 有一个要落地的需求，且希望能留下可复查的决策与规范
- 做多人协作，需要别人接手时能看懂「为什么这么做」
- 想强制自己先想清楚再写代码（拷问阶段不允许写代码）

不适合：一次性小脚本、纯问答、紧急线上排障（那种直接修，事后补记录）。

**怎么用**

1. 新建会话，预设选「Matt 工程流」
2. 直接说需求。它会先拷问：把决策做成卡片（选项 + 补充输入框），一次最多三题
3. 谈定后写规范、拆任务单、按单实现、评审、收尾
4. 全程可以用输入框左侧的胶囊看进度；点开浮层能看到每一步要做什么

三条命令按需使用：

| 命令 | 用途 |
|---|---|
| `/grill-with-docs` | 用户手动触发拷问（模型在预设里会自己加载同样两个技能） |
| `/to-spec` | 只想要规范、不想走完整流程时 |
| `/code-review` | 只想评审某个分支或 PR |

**它会留下什么**

- `.scratch/<feature>/decisions.md` — 这次变更的决策
- `.scratch/<feature>/spec.md` — 规范
- `.scratch/<feature>/issues/*.md` — 任务单，含阻塞关系
- `CONTEXT.md` / `docs/adr/` — 术语与难以撤销的决定，**按需创建**（没有就不写）

**第一次用之前**

如果仓库还没定过 issue 放在哪，第一次进规范阶段前会要求写 `docs/agents/issue-tracker.md`。默认本地 markdown（`.scratch/`）即可；想要完整布局（triage 标签、域文档、`## Agent skills` 块）就自己跑一次 `/setup-matt-pocock-skills`。

## 阶段与前置条件

`拷问 → 规范 → 任务 → 实现 → 评审 → 收尾`

进入下一阶段前要满足什么：

| 进入 | 前置条件 |
|---|---|
| `grill` | 无，直接开始拷问 |
| `spec` | `evidence` 写明拷问收口了什么决策；且 `docs/agents/issue-tracker.md` 存在 |
| `tickets` | `.scratch/<feature>/spec.md` 存在且 ≥ 200 字符 |
| `implement` | `.scratch/<feature>/issues/` 下至少 1 个 `.md` |
| `review` | `evidence` 写明跑过的 typecheck 与测试 |
| `done` | 说明评审结论与提交 |

前置条件只校验**能校验的部分**（文件是否存在、内容是否够量、evidence 是否非空）。它不假装验证"测试真跑过了"——那句证据由模型自己写，你能在 `flow.json` 的 history 里看到它。

### 为什么 spec 要求先记下 issue tracker

Matt 的套件有一条前置：`/setup-matt-pocock-skills`，用来定下 issue 放哪（GitHub / GitLab / 本地 markdown）、triage 标签词表、以及 `CONTEXT.md` 与 ADR 的目录布局，产出写进 `docs/agents/*.md` 并在 CLAUDE.md/AGENTS.md 里留一个 `## Agent skills` 块。

那一整套是用户命令，模型跑不了；但它的结论是下游技能的前提——`/to-spec`、`/to-tickets`、`/triage` 的正文里都写着"若未配置，让用户先跑 `/setup-matt-pocock-skills`"。

所以这里只强制**最小的一步**：把 issue tracker 的结论落进 `docs/agents/issue-tracker.md` 才允许写 spec。默认值是本地 markdown（`.scratch/<feature>/`），因为流程本来就写在那里；想要完整的标签词表与域文档布局，再让用户跑一次 `/setup-matt-pocock-skills`。

## 安装

```bash
dsh plugin --profile desktop add /path/to/dsh-matt-flow
```

或在 DSH 的 Plugins 页面用本地目录安装。安装后**新建会话**，在预设置换器里选「Matt 工程流 / Matt Flow」。

已存在的会话不受影响：预设只在新建会话时装入。

### 在哪里选

1. **新建会话的空白页**：底部输入区的工具行里，工作区选择器旁边有预设芯片（默认显示「标准 / Standard」），点开就是预设菜单，选「Matt 工程流」。
2. **设置 → Agent 预设**（`settings.agentPreset`）：按「内置 / 自定义」分组列出卡片，「Matt 工程流」在自定义组；卡片可「查看配置」（只读 YAML），也可设为**新建会话的默认**。

装好后若菜单里还没出现，刷新页面一次——预设名单在连接重置时刷新；当前已存在的会话不会切过去，必须新建。

> 本机 `desktop` profile 已经装好（bundle 在 profile 的 bundles 列表里，`preset-matt` 行 active）。**改完 `index.js` 必须重启 DSH**：预设子树持有的模块在 Node 的 ESM 缓存里，`install_bundle` 会明确返回 `restart-required`（原因 `unmanaged-plugin`），热重载不会换掉已加载的代码。重启后看系统临时目录里的 `dsh-matt-flow-load.log` 确认版本号（macOS/Linux 在 `/tmp`，Windows 在 `%TEMP%`）。
>
> **改完 `client.js` 必须刷新页面**：浏览器侧模块由 `dsh.client` 清单扫描后加载，页面不刷新就拿不到新模块。改完先 `node --check client.js`，再到页面上刷新；注册成功后可在 `tool.call.toolview` 的 occupant 里看到 `flow_ask`。

## 用起来是什么样

1. 新建会话，选 `Matt Flow`，把你的想法说出来。
2. 模型会拉 `grilling` 跟你把设计问清楚，而不是直接改代码。
3. 它调 `flow_stage({action:"advance", to:"spec"})` 前进时，前置条件要求它先把决策写进 evidence。
4. 规范写进 `.scratch/<feature>/spec.md`，任务单写进 `.scratch/<feature>/issues/`，实现阶段逐张任务单走 `tdd`，最后 `code-review`。
5. 随时 `flow_stage({action:"status", feature:"..."})` 看进度和下一阶段的前置条件。

## 外部依赖与权限

### 运行时依赖

**没有任何 npm 依赖。** 插件只使用 Node 内置模块（`fs`、`path`、`os`、`child_process`），浏览器侧只用宿主提供的 React。

### 它会启动子进程

`flow_skills` 工具和预设激活时的自动准备会执行：

```
npx -y skills@latest add mattpocock/skills -g -s '*' -y
```

这会把 [mattpocock/skills](https://github.com/mattpocock/skills) 装进 `~/.agents/skills`，影响这台机器上**所有**读该目录的 agent（Claude Code 等）。

触发条件很窄：

- 只在 7 个必需技能缺失时才执行
- 失败后 24 小时内不再自动重试
- 可用 `flow_skills` 查看状态、或手动重试
- 不想让它执行，就别用这个预设；插件不会在预设之外运行

**前提**：机器上要有 `node` 和 `npx`，且能访问 npm registry 与 GitHub。缺失时不会崩溃，只会把状态记为 `failed`。

### 它写哪些文件

| 路径 | 内容 |
|---|---|
| `.scratch/<feature>/flow.json` | 阶段状态 |
| `.scratch/<feature>/decisions.md`、`spec.md`、`issues/*.md` | 流程产物（由模型写，不是你手动维护） |
| `docs/agents/issue-tracker.md` | 首次进规范阶段前要求存在的 tracker 说明 |
| `~/.dsh/matt-flow-bootstrap.json` | 技能安装状态 |
| 系统临时目录下的 `dsh-matt-flow-*.log` | 启动打点与安装日志 |

### 权限范围

插件不申请额外权限，不读取凭据，不发起除上述 `npx` 之外的网络请求。

## 已知边界

- **不接管模型行为**：提示词是强约束、不是硬约束。真正的强制只有 `flow_stage` 的前置条件——模型完全可以绕过它直接改代码。要更强的约束，得再加 `ctx.tools.guard()`。
- **预设即快照**：插件集复制自官方 `standard` 预设。DSH 升级后 `standard` 若增删插件，这个预设不会自动跟随；升级后建议对照 `@deepseek-ai/dsh-web-app/presets/standard.patch.yml` 同步一次。
- **UI 有限**：只有一个状态胶囊（输入框工具行）+ 决策卡，没有任务看板。
- **工具定义用普通 JSON Schema**：没有用 `defineTool()`，因为插件从工作区链接安装时解析不到 `@deepseek-ai/*`。发布为 npm 包后可以改回。
- **未在 Windows 上实测**：已按平台适配日志目录、`npx.cmd`、`cmd.exe` 兜底和 `--copy`，但没有真机验证。

## 许可证

MIT，见 [LICENSE](./LICENSE)。

### 排障

`apply` 会往系统临时目录的 `dsh-matt-flow-load.log` 与 `dsh-matt-flow-apply.log` 各写一行启动打点（macOS/Linux 在 `/tmp`，Windows 在 `%TEMP%`）：前者证明模块被导入，后者证明 `apply` 执行、各注册项成功。出现任何"预设加载失败"时先看这两个文件——没有 load 行是导入问题，有 load 无 apply 是注入问题。确认稳定后可以删掉这两处打点。


## 卸载

```bash
dsh plugin --profile desktop remove dsh-matt-flow
```

`.scratch/` 下的数据是你的，不会被清理。
