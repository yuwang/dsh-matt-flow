# dsh-matt-flow

**主页**：https://github.com/yuwang/dsh-matt-flow

[![npm version](https://img.shields.io/npm/v/dsh-matt-flow)](https://www.npmjs.com/package/dsh-matt-flow)
[![downloads](https://img.shields.io/npm/dt/dsh-matt-flow)](https://www.npmjs.com/package/dsh-matt-flow)
[![GitHub issues](https://img.shields.io/github/issues/yuwang/dsh-matt-flow)](https://github.com/yuwang/dsh-matt-flow/issues)
[![license](https://img.shields.io/github/license/yuwang/dsh-matt-flow)](https://github.com/yuwang/dsh-matt-flow/blob/master/LICENSE)

**Turn the Matt Pocock skill suite into a staged development workflow for DeepSeek Harness.** One feature walks grill → spec → tickets → implement → wrap-up, and a skipped stage is refused rather than silently allowed.

**把 Matt Pocock 技能套件编成一条带前置条件的开发流程**：一个预设，带着你从拷问走到收尾；想跳级会被拒绝。

如果它帮到你，欢迎到 [GitHub](https://github.com/yuwang/dsh-matt-flow) 点个 Star、到 [Issues](https://github.com/yuwang/dsh-matt-flow/issues/new) 提问题，也欢迎直接提交 PR。

---

## 它提供什么

一个 bundle，五层内容：

| 组成 | 作用 |
|---|---|
| `preset-matt` | 新增一个 agent 预设 `matt-flow`，插件集即官方 `standard` 预设 + 本包的 `matt-flow` 插件。在新建会话的预设选择器里出现。 |
| 系统提示词段落 `matt-flow` | 告诉模型：哪些技能它能自己 `skill` 加载（`grilling`/`tdd`/`code-review`/`diagnosing-bugs`…），哪些只能由你 `/命令` 触发（`/to-spec`、`/to-tickets`…），以及 拷问 → 规范 → 任务 → 实现 → 收尾 的顺序、每阶段该做什么。评审不是独立阶段，它在实现里完成。 |
| 工具 `flow_stage` | 记录并推进某个 feature 的阶段，落盘到 `.scratch/<feature>/flow.json`。前进必须逐级、且要满足前置条件；回退（返工）允许。 |
| 工具 `flow_ask` + 决策卡（`client.js`） | 拷问阶段把决策做成对话里的卡片：每题一组选项加一个补充输入框，一次最多三题。点「提交选择」后，答案作为你的下一条消息发出，模型接着往下走。卡片由本包自己的浏览器模块渲染，**不依赖 dsh-genui**。 |
| 工具 `flow_skills` + 阶段胶囊（`client.js`） | `flow_skills` 报告那 24 个技能装没装；胶囊在输入框工具行左侧，显示当前阶段、第几步、**正在运行哪些子代理**。点开浮层看每个阶段的说明和前置条件。只在 Matt 预设的会话里出现。 |

它不复制、不改写任何技能；`npx skills update` 之后行为自动跟随上游。

### 一个包，两行挂载

浏览器侧代码只能从**顶层** Loader 条目聚合，而宿主行为必须留在**预设子树**里（否则会污染所有会话）。同一个包因此挂两次：

- 顶层 `matt-flow-ui` 行：只为让浏览器扫描到 `dsh.client`，它的 config 是 `uiOnly: true`，`apply()` 立刻返回，不注册任何东西
- 预设里 `matt-flow` 行：真正的工作（提示词、三个工具、投影）

这就是插件页只显示一个条目的原因。

## 安装

从 npm 装（推荐，预构建，装得快）：

```bash
dsh plugin add dsh-matt-flow
```

从 GitHub 装（拿到的是仓库最新代码）：

```bash
dsh plugin add git+https://github.com/yuwang/dsh-matt-flow
```

也可以在 DSH 的 Plugins 页面里装：

- **插件 → 发现 → 搜索** `dsh-matt-flow` → 安装
- **插件 → 添加插件 → 输入准确包名** `dsh-matt-flow` → 安装

命令行 / agent 也可以直接：

```
install_bundle  dsh-matt-flow@latest
```

本地开发时用目录安装：

```bash
dsh plugin --profile desktop add /path/to/dsh-matt-flow
```

或 **插件 → 添加插件 → 选择插件目录**。装完**重启一次**，再**新建会话**，在预设置换器里选「Matt 工程流 / Matt Flow」。

### 在哪里选

1. **新建会话的空白页**：底部输入区的工具行里，工作区选择器旁边有预设芯片（默认显示「标准 / Standard」），点开就是预设菜单，选「Matt 工程流」。
2. **设置 → Agent 预设**（`settings.agentPreset`）：按「内置 / 自定义」分组列出卡片，「Matt 工程流」在自定义组；卡片可「查看配置」（只读 YAML），也可设为**新建会话的默认**。

装好后若菜单里还没出现，刷新页面一次——预设名单在连接重置时刷新；当前已存在的会话不会切过去，必须新建。

### 装好之后

第一次进规范阶段前，仓库里需要有一份 `docs/agents/issue-tracker.md` 说明 issue 放在哪。没配过就跑一次 `/setup-matt-pocock-skills`，或者直接让模型按本地 markdown 写一份。

没有强制你手工准备任何东西：流程第一次用到时，`flow_stage` 会检查那 24 个必需技能和这份配置，缺了就弹出审批，你点同意之后它自己装、自己写。拒绝了就什么都不动。

## 用起来是什么样

1. 新建会话，选 `Matt Flow`，把你的想法说出来。
2. 模型会拉 `grilling` 跟你把设计问清楚，而不是直接改代码。决策做成卡片：选项 + 补充输入框，一次最多三题。
3. 它调 `flow_stage({action:"advance", to:"spec"})` 前进时，前置条件要求它先把决策写进 evidence。
4. 规范写进 `.scratch/<feature>/spec.md`，任务单写进 `.scratch/<feature>/issues/`。实现阶段逐张任务单走 `tdd`，每张做完就跑 `code-review` 并提交。
5. 随时 `flow_stage({action:"status", feature:"..."})` 看进度和下一阶段的前置条件。

全程可以用输入框左侧的胶囊看进度；点开浮层能看到每一步要做什么，以及此刻有几个子代理在跑。

## 模式说明

**它是什么**

一条带前置条件的开发工作流。每个 feature 走同一条路：拷问 → 规范 → 任务 → 实现 → 收尾。每一步做完，才能进下一步；跳级会被 `flow_stage` 拒绝。

评审不单独占一格：每张任务单实现完就评审、提交。

子代理不限于评审——探查、搜索、跑测试、独立实现都可以。胶囊会把**当前正在运行的子代理**按各自的名字列出来，不管它们在做什么。

它不是新的 AI 能力，而是把 Matt Pocock 那套技能串成有顺序、有产出的流程——技能本身仍然从 `~/.agents/skills` 读取，插件只负责编排。

**什么时候用它**

- 有一个要落地的需求，且希望能留下可复查的决策与规范
- 做多人协作，需要别人接手时能看懂「为什么这么做」
- 想强制自己先想清楚再写代码（拷问阶段不允许写代码）

不适合：一次性小脚本、纯问答、紧急线上排障（那种直接修，事后补记录）。

**三条命令按需使用**

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

## 阶段与前置条件

`拷问 → 规范 → 任务 → 实现 → 收尾`

进入下一阶段前要满足什么：

| 进入 | 前置条件 |
|---|---|
| `grill` | 无，直接开始拷问 |
| `spec` | `evidence` 写明拷问收口了什么决策；且 `docs/agents/issue-tracker.md` 存在 |
| `tickets` | `.scratch/<feature>/spec.md` 存在且 ≥ 200 字符 |
| `implement` | `.scratch/<feature>/issues/` 下至少 1 个 `.md` |
| `done` | 说明实现完成、评审通过、改动已提交 |

前置条件只校验**能校验的部分**（文件是否存在、内容是否够量、evidence 是否非空）。它不假装验证「测试真跑过了」——那句证据由模型自己写，你能在 `flow.json` 的 history 里看到它。

### 接手别人做了一半的活

如果规范、任务单是在别处写好的（另一个会话、另一台机器、或者先跑 `/to-tickets` 再 `/handoff`），不需要在这个会话里把前几个阶段重演一遍。让模型调用：

```
flow_stage { action: "resume", feature: "<slug>" }
```

它读 `.scratch/<slug>/` 下的文件，倒推已经走到哪：

| 磁盘上有 | 记为 |
|---|---|
| `issues/*.md` 至少 1 个 | `implement` |
| `spec.md` ≥ 200 字符 | `tickets` |
| `decisions.md` | `spec` |
| 都没有 | `grill` |

只往前推，不往回退：记录已经是 `done` 时再 resume，仍然是 `done`。来源会写进 `flow.json` 的 history，形如 `resumed from spec.md, issues (2)`。

两条限制：只看 `.scratch/<slug>/` 里的文件，`docs/agents/issue-tracker.md` 这类仓库级配置不算进度；如果那边的任务单落在 GitHub Issues 而不是本地 markdown，这里读不到，resume 会停在 `spec`，需要先把单子导成 `.scratch/<slug>/issues/NN-slug.md`。

### 为什么 spec 要求先记下 issue tracker

Matt 的套件有一条前置：`/setup-matt-pocock-skills`，用来定下 issue 放哪（GitHub / GitLab / 本地 markdown）、triage 标签词表、以及 `CONTEXT.md` 与 ADR 的目录布局，产出写进 `docs/agents/*.md` 并在 CLAUDE.md/AGENTS.md 里留一个 `## Agent skills` 块。

那一整套是用户命令，模型跑不了；但它的结论是下游技能的前提——`/to-spec`、`/to-tickets`、`/triage` 的正文里都写着「若未配置，让用户先跑 `/setup-matt-pocock-skills`」。

所以这里只强制**最小的一步**：把 issue tracker 的结论落进 `docs/agents/issue-tracker.md` 才允许写 spec。默认值是本地 markdown（`.scratch/<feature>/`），因为流程本来就写在那里；想要完整的标签词表与域文档布局，再让用户跑一次 `/setup-matt-pocock-skills`。

## 外部依赖与权限

### 运行时依赖

**没有任何 npm 依赖。** 插件只使用 Node 内置模块（`fs`、`path`、`os`、`child_process`），浏览器侧只用宿主提供的 React。

### 它会启动子进程

装技能时执行的是：

```
npx -y skills@latest add mattpocock/skills -g -a universal -s <缺失的技能名> -y
```

这会把 [mattpocock/skills](https://github.com/mattpocock/skills) 里**流程用到的 24 个技能**装进 `~/.agents/skills`，影响这台机器上所有读该目录的 agent（Claude Code 等）。用 `-a universal` 是为了只写共享目录，不往其它 agent 的目录里建符号链接。

触发条件很窄：

- 只在 24 个必需技能有缺失、或 `docs/agents/issue-tracker.md` 还没写时才执行
- **执行前一定弹审批**，列出要装什么、写哪些文件；你拒绝就什么都不做
- 失败后 24 小时内不再自动重试，避免反复打扰
- 可用 `flow_skills` 查看状态

**前提**：机器上要有 `node` 和 `npx`，且能访问 npm registry 与 GitHub。缺失时不会崩溃，只会把状态记为 `failed`，并把原始报错交回来。

### 它写哪些文件

| 路径 | 内容 |
|---|---|
| `.scratch/<feature>/flow.json` | 阶段状态 |
| `.scratch/<feature>/decisions.md`、`spec.md`、`issues/*.md` | 流程产物（由模型写，不是你手动维护） |
| `docs/agents/issue-tracker.md` | 首次进规范阶段前要求存在的 tracker 说明 |
| `~/.agents/skills/<name>/` | 技能本体（通过 `npx skills` 安装） |
| 系统临时目录下的 `dsh-matt-flow-*.log` | 启动打点与安装日志 |

上面每一项都发生在审批之后。

### 权限范围

插件不申请额外权限，不读取凭据，不发起除上述 `npx` 之外的网络请求。

## 已知边界

- **不接管模型行为**：提示词是强约束、不是硬约束。真正的强制只有 `flow_stage` 的前置条件——模型完全可以绕过它直接改代码。要更强的约束，得再加 `ctx.tools.guard()`。
- **预设即快照**：插件集复制自官方 `standard` 预设。DSH 升级后 `standard` 若增删插件，这个预设不会自动跟随；升级后建议对照 `@deepseek-ai/dsh-web-app/presets/standard.patch.yml` 同步一次。
- **UI 有限**：只有一个状态胶囊（输入框工具行）+ 决策卡，没有任务看板。
- **resume 只认本地文件**：它按 `.scratch/<feature>/` 里的 `decisions.md`、`spec.md`、`issues/*.md` 推断阶段。任务单若在 GitHub Issues 或 Linear 上，读不到，只能停在 `spec`。
- **工具定义用普通 JSON Schema**：没有用 `defineTool()`，因为插件从工作区链接安装时解析不到 `@deepseek-ai/*`。发布为 npm 包后可以改回。
- **未在 Windows 上实测**：已按平台适配日志目录、`npx.cmd`、`cmd.exe` 兜底和 `--copy`，但没有真机验证。

## 本地开发

改完代码后：

- **`index.js` 改动**：必须重启 DSH。预设子树持有的模块在 Node 的 ESM 缓存里，`install_bundle` 会返回 `restart-required`（原因 `unmanaged-plugin`），热重载换不掉已加载的代码。重启后看系统临时目录的 `dsh-matt-flow-load.log` 确认版本号（macOS/Linux 在 `/tmp`，Windows 在 `%TEMP%`）。
- **`client.js` 改动**：先 `node --check client.js`，再刷新页面。浏览器侧模块由 `dsh.client` 清单扫描后加载，不刷新拿不到新模块；注册成功后可在 `tool.call.toolview` 的 occupant 里看到 `flow_ask`。
- **改完先跑一遍**：`npm test`（约 1 秒，5 个文件、73 条断言，不依赖网络）。

### 排障

`apply` 会往系统临时目录的 `dsh-matt-flow-load.log` 与 `dsh-matt-flow-apply.log` 各写一行启动打点（macOS/Linux 在 `/tmp`，Windows 在 `%TEMP%`）：前者证明模块被导入，后者证明 `apply` 执行、各注册项成功。出现任何「预设加载失败」时先看这两个文件——没有 load 行是导入问题，有 load 无 apply 是注入问题。确认稳定后可以删掉这两处打点。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

MIT，见 [LICENSE](./LICENSE)。
