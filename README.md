# MD Task Manager

一个本地运行的单用户 web app，作为 markdown 任务库之上的管理界面。
**md 文件是唯一事实来源** —— 没有数据库，随时可以脱离本 app 直接在 Obsidian 里编辑。

行内元数据使用 [Obsidian Tasks 插件](https://publish.obsidian.md/tasks/) 的 emoji 语法，双向兼容：

```markdown
- [ ] 完成 SR 模型的 ablation 实验 ⏫ 🆔 k3x9ab 📅 2026-07-25
    - [ ] 准备 baseline checkpoint 🆔 m2p4qq
    - [ ] 跑 4 组消融配置 🆔 n8r2ws ⛔ m2p4qq
- [x] 写实验设计文档 🆔 a1b2c3 ✅ 2026-07-20
```

---

## 快速开始

```bash
# 1. 后端依赖
uv venv --python 3.12 .venv
uv pip install -e ".[dev]"

# 2. 前端构建（产物会被后端自动托管）
cd frontend && npm install && npm run build && cd ..

# 3. 启动
uv run mdtask --vault ./vault
# → http://127.0.0.1:8722
```

`--vault` 指向你的 Obsidian vault（或其中一个子目录）。默认使用本地 `./vault`，其中的任务内容不会纳入 Git。

### 开发模式

```bash
uv run mdtask --vault ./vault      # 终端 1：后端 :8722
cd frontend && npm run dev         # 终端 2：Vite :5173（已配置 /api 与 /ws 代理）
```

### 项目 Dashboard

Dashboard 是默认首页。除 `Inbox.md` 与 `Today/` 日程文件外，每个 Markdown 文件都视为一个项目；项目卡展示全部层级任务的完成进度，以及文件中位置最靠后的最近任务。点击项目卡可进入对应的单文件任务视图。

当前任务格式没有创建时间字段，因此“最新任务”按任务在项目文件中的位置倒序计算，而不是伪造时间排序。

### 项目管理

从侧栏进入「项目管理」（或按 `G` `P`）可以完成项目的增删改查：

- 创建项目：输入名称后创建空的 `projects/<项目名>.md`。
- 查看项目：列表展示路径、进度、任务数和最新任务，点击即可进入项目任务视图。
- 重命名项目：只修改 Markdown 文件名，文件内容保持不变。
- 删除项目：文件会移动到 vault 的 `.trash/mdtask-projects/`，不会直接擦除；相关任务的 Today 引用和跨任务依赖会同步清理。

### Today 按项目分组

Today 会按照任务所属的 Markdown 项目自动分组，并显示各组当日任务的完成数量与进度；同名项目会同时显示完整路径以便区分。Inbox 和已经找不到原任务的失效引用会分别显示在独立分组中。

项目组按它第一次出现在今日日程中的位置排列，组内继续保留原有的 Today 顺序。拖动任务左侧的 `⠿` 手柄只能调整同一项目内的顺序，不会改变任务所属项目；拖动整行仍沿用“移动为另一任务的子任务”的行为。

### 测试

```bash
.venv/bin/python -m pytest -q
```

---

## 快捷键

| 键 | 作用 |
|---|---|
| `Q` | 快速添加浮层（连续录入，`Esc` 关闭）|
| `G` `D` / `G` `P` / `G` `T` / `G` `I` / `G` `A` | 切换到 Dashboard / 项目管理 / Today / Inbox / All Tasks |
| `↑` `↓` | 移动选中 |
| `1`–`4` / `0` | 设定优先级 最高/高/中/低 / 清除 |
| `Space` | 开合右侧详情面板 |
| `X` | 勾选 / 取消勾选 |
| `E` / 双击 | 行内编辑标题 |
| `T` | 加入 / 移出今日日程 |
| `Enter` / `Shift+Enter` | 新建同级 / 子任务 |
| `Tab` / `Shift+Tab` | 增加 / 减少层级（上限 4 级）|
| `Del` | 删除任务（含子树，二次确认）|

快速添加浮层里，标题输入框右侧有优先级下拉框：在输入框中按 `Alt+P`（或 `Ctrl+P`）直接聚焦并展开，然后按 `1`~`4` 直接选定优先级（`0` 清除）并收起，或用 `↑` `↓` 移动高亮后按 `Enter` —— `Enter` 会采用高亮项并立即提交任务；`Esc` 只收起下拉，焦点回到输入框。所选优先级在连续录入时保持不变，关闭浮层后重置为「无」。

标题结尾的 `!1`~`!4` 语法糖依然可用，且优先于下拉框的选择。

### 拖动调整层级

Today / Inbox / All Tasks / 单文件视图都支持：把一条任务拖到另一条任务上，它（连同自己的子树）就会成为对方的
**最后一个子任务**，跨文件也可以（🆔 不变，依赖与今日日程引用照常有效）。
可放下的目标会高亮；自己、自己的子孙、以及会超过 4 级上限的目标不接受放下，松手后原地弹回。
想把子任务提回上一级用 `Shift+Tab`。

Today 视图里两种拖动分工：拖左侧 `⠿` 手柄 = 调整同一项目内的当日顺序；拖整行 = 变成别人的子任务。

对应接口是 `POST /api/tasks/{id}/move  {"parent_id": "..."}`。

---

## 文件布局

```
<vault>/
├── Inbox.md              # 快速添加的落点（不存在则自动创建）
├── Today/
│   └── 2026-07-21.md     # 今日日程：有序的任务 id 引用
└── projects/*.md         # 你自己的任意 md 文件
```

Today 文件**只引用不复制**：

```markdown
---
date: 2026-07-21
---

- [[k3x9ab]]
- [[n8r2ws]]
```

任务的完成状态、优先级始终只写在原始文件里。在 Today 视图勾选完成，改动落在**原文件**，Today 文件不变。

---

## 架构

| 层 | 位置 | 说明 |
|---|---|---|
| 解析 / 序列化 | `mdtask/parser.py` | 正则 + 缩进栈，无 markdown AST 库 |
| 任务库与写回 | `mdtask/vault.py` | 原子写（临时文件 + `os.replace`）、mtime 校验、环检测 |
| 今日日程 | `mdtask/today.py` | 引用列表读写、顺延、失效清理 |
| 文件监听 | `mdtask/watcher.py` | watchdog + 500ms debounce + 自写指纹去重 |
| HTTP / WS | `mdtask/server.py` | FastAPI，托管前端构建产物 |
| 前端 | `frontend/src` | React 18 + TS + Vite + Tailwind + zustand + dnd-kit |

### 非任务行绝不被改动

`FileDoc` 持有整份文件的行列表（**包含行尾符**），写回时只替换发生修改的那些行，其余行原样拼回。因此 diff 永远只落在被编辑的 checkbox 行上。

### 依赖与 blocked

`blocked` 是派生状态，不写盘：`depends_on` 里存在任意未完成任务即为 blocked。写入依赖前做 DFS 环检测，成环返回 `409 CYCLE_DETECTED` 并附带 id 链，文件不发生任何变化。指向不存在 id 的依赖被忽略并产生 warning（不视为 blocked）。

### id 策略

6 位 base36 随机 id，写在行内 `🆔`。**不会**在启动时批量改写用户文件 —— 没有 `🆔` 的既存任务只在首次被 app 修改时才补写 id；在此之前 UI 用 `file:line` 作临时 key，并在行尾显示一个灰点提示。重复的 `🆔`（含跨文件）保留首个，其余按无 id 处理并 warning。

---

## 开放决策

PRD 附录 A 允许自选的部分，本实现的选择：

- **组件库**：裸写 Tailwind，不引入 shadcn/ui。信息密度要求高、组件形态简单，额外抽象层收益不足。
- **WebSocket 粒度**：整库刷新信号 `{type: "vault_changed"}`，前端收到后重拉 `/api/tasks`、`/api/files`、`/api/today`。本地单用户场景下数据量小，增量 diff 不划算。
- **快捷键**：不引入 `react-hotkeys-hook`，用单个 `window` keydown 监听器（`src/useKeyboard.ts`）。`G` 实现为 1.2s 超时的 leader key。
- **上下移动选中**：选中顺序直接从 DOM 的 `[data-task-key]` 读取，因此与各视图当前的过滤/折叠结果天然一致。

---

## 边界情况处理

| 情况 | 行为 |
|---|---|
| 空 vault / 缺 `Inbox.md` / 缺 `Today/` | 启动时自动创建 |
| 非 UTF-8 的 md 文件 | 跳过该文件，侧边栏显示 warning |
| 标题中部含 `📅` `⛔` 等 emoji | 只从行尾按 token 规则剥离，不受影响 |
| 5 级及更深缩进 | 归并到第 4 级并 warning |
| tab / 2 空格缩进 | 读取时兼容，写回统一 4 空格 |
| 同一任务重复加入 Today | 去重，保留首次位置 |
| Today 引用的任务已被删除 | 显示为灰色失效条目，一键清除 |
| 文件在 app 运行期间被外部删除 | 任务从视图移除，Today 引用变为失效条目 |
| `os.replace` 原子写失败（NFS/Windows）| 降级为直接写并记录日志 |

---

## 未实现（M2）

任务跨文件移动、`📅` 截止日期的完整支持与逾期视图、已完成任务自动归档、依赖关系图可视化。
数据模型与 API 已为这些留出位置（`due` 字段已完整解析/序列化/往返）。
