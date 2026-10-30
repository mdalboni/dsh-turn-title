# dsh-turn-title

[English](README.md) | Português (Brasil) | [中文](README.zh.md)

Um plugin para DeepSeek Harness (DSH) que gera títulos automaticamente para a conversa após a primeira troca completa (primeira mensagem do usuário + resposta do assistente) e adiciona um botão **Atualizar Título** no cabeçalho do chat.

![Ícone](icon.svg)

---

## Recursos

- **Auto-Título no Turno 1:** Substitui o gerador padrão (que roda antes da resposta). Espera a primeira resposta do modelo terminar para gerar títulos muito mais precisos e contextuais.
- **Botão no Cabeçalho do Chat:** Adiciona `✎ Atualizar Título` no cabeçalho da conversa (`conversation.session.header.actions`).
  - **Clique simples:** Reavalia o contexto recente e gera um novo título com IA.
  - **Shift + Clique (ou Alt + Clique):** Abre diálogo para editar o título manualmente.
- **Suporte a Localização DSH:** Adapta os botões, mensagens e instruções do prompt ao idioma ativo na interface do DSH (Português, Inglês, Chinês, etc.).
- **Compatível com Temas:** Usa as variáveis de tema nativas do DSH (`--dsw-alias-*`), integrando-se perfeitamente aos modos claro e escuro.
- **Leve:** ESM puro, sem dependências externas em tempo de execução.

---

## Instalação

### Pelo Mercado de Plugins do DSH (`dshmarket`)
Procure por `dsh-turn-title` no Plugin Market do DSH e clique em **Instalar**.

### Pelo Terminal DSH
```bash
dsh plugin --profile web add dsh-turn-title
```

### A partir do Código Fonte Local
```bash
git clone https://github.com/mdalboni/dsh-turn-title.git
dsh plugin --profile web add link:./dsh-turn-title
```

---

## Como Funciona

1. **Gancho de Eventos no Host:** Escuta `session/event` aguardando `turn/end` com `turn === 1` e `reason.kind === 'completed'`. Quando acionado, executa `ctx.llm.stream` e salva o título através de `ctx.sessionTitle.rename`.
2. **Endpoint HTTP:** Registra `POST /api/session-title/update` em `ctx.webServer`. Recebe `{ sessionId, title, locale }` para renomear diretamente ou gerar via IA.
3. **Slot de Interface no Cliente:** Registra o botão no slot `conversation.session.header.actions` com `ctx.slots.inject`, consumindo traduções via `ctx.locale`.

---

## Testes

Execute a suíte de testes com o test runner nativo do Node.js:

```bash
node --test test/index.test.js
```

---

## Licença

MIT © Maxwell Dalboni
