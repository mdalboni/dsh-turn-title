# dsh-turn-title

English | [Português (Brasil)](README.pt-BR.md) | [中文](README.zh.md)

A DeepSeek Harness (DSH) plugin that automatically generates conversation titles after the first full exchange (user prompt + assistant response) and adds an **Update Title** button directly in the chat header.

![Icon](icon.svg)

---

## Features

- **Turn-1 Auto-Titling:** Replaces the stock prompt-only titler. It waits for the assistant's first response to complete, giving the model full context to produce accurate, descriptive titles.
- **Chat Header Button:** Adds a `✎ Update Title` button to the conversation header (`conversation.session.header.actions`).
  - **Single Click:** Re-evaluates conversation context and generates a fresh title with AI.
  - **Shift + Click (or Alt + Click):** Opens a prompt dialog to enter a manual title.
- **Multilingual & DSH Locale Aware:** Automatically aligns UI labels and prompt instructions with the active DSH interface language (English, Portuguese, Chinese, etc.).
- **Theme-Native:** Uses DSH `--dsw-alias-*` CSS variables, matching dark and light mode themes seamlessly.
- **Lightweight:** Pure ESM, zero external runtime dependencies.

---

## Installation

### Via DSH Plugin Market (`dshmarket`)
Search for `dsh-turn-title` in the DSH Plugin Marketplace and click **Install**.

### Via DSH CLI
```bash
dsh plugin --profile web add dsh-turn-title
```

### From Local Source
```bash
git clone https://github.com/mdalboni/dsh-turn-title.git
dsh plugin --profile web add link:./dsh-turn-title
```

---

## How It Works

1. **Host Event Hook:** Listens to `session/event` for `turn/end` where `turn === 1` and `reason.kind === 'completed'`. If the session does not yet have a custom title, it invokes `ctx.llm.stream` and updates the title via `ctx.sessionTitle.rename`.
2. **HTTP Endpoint:** Registers `POST /api/session-title/update` on `ctx.webServer`. Receives `{ sessionId, title, locale }` to either rename manually or trigger an AI title update.
3. **Client UI Slot:** Injects a button into `conversation.session.header.actions` using `ctx.slots.inject`, with localized text managed via `ctx.locale`.

---

## Testing

Run the included test suite with Node.js built-in test runner:

```bash
node --test test/index.test.js
```

---

## License

MIT © Maxwell Dalboni
