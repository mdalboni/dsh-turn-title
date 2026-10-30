# dsh-turn-title

[English](README.md) | [Português (Brasil)](README.pt-BR.md) | 中文

为 DeepSeek Harness (DSH) 设计的会话标题增强插件：在第一轮对话完整结束（首条用户提问 + 助手完整回复）后自动生成精准会话标题，并在聊天顶部工具栏添加**更新标题**按钮。

![图标](icon.svg)

---

## 功能特性

- **首轮完整对话后自动生成标题：** 替代仅根据首条提问过早生成标题的默认行为。等待助手回复完成后再生成，包含完整上下文，标题更准确、更具描述性。
- **对话顶部按钮：** 在会话标题右侧操作栏（`conversation.session.header.actions`）添加 `✎ 更新标题` 按钮。
  - **单击：** 结合最近上下文，使用大模型重新生成标题。
  - **Shift + 单击（或 Alt + 单击）：** 弹出输入框手动修改会话标题。
- **多语言及 DSH 语言跟随：** 界面文案与大模型标题生成指令自动跟随 DSH 系统当前选中的语言（中文、英语、葡萄牙语等）。
- **原生主题融合：** 使用 DSH 规范的 `--dsw-alias-*` CSS 变量，完美贴合深色与浅色模式。
- **轻量稳定：** 纯原生 ESM 模块，零第三方运行时依赖。

---

## 安装方法

### 通过 DSH 插件市场 (`dshmarket`)
在 DSH 插件市场中搜索 `dsh-turn-title` 并点击**安装**。

### 通过 DSH 命令行
```bash
dsh plugin --profile web add dsh-turn-title
```

### 通过本地源码链接
```bash
git clone https://github.com/mdalboni/dsh-turn-title.git
dsh plugin --profile web add link:./dsh-turn-title
```

---

## 运行机制

1. **Host 事件监听：** 监听 `session/event` 的 `turn/end` 事件（条件：`turn === 1` 且 `reason.kind === 'completed'`）。触发时调用 `ctx.llm.stream` 生成标题，并通过 `ctx.sessionTitle.rename` 持久化记录到会话日志。
2. **HTTP 服务端点：** 在 `ctx.webServer` 上注册 `POST /api/session-title/update`，支持直接手动重命名或触发大模型重新总结。
3. **Client UI 槽位：** 通过 `ctx.slots.inject` 挂载到 `conversation.session.header.actions`，多语言文案通过 `ctx.locale` 响应式切换。

---

## 单元测试

运行 Node.js 原生测试套件：

```bash
node --test test/index.test.js
```

---

## 开源协议

MIT © Maxwell Dalboni
