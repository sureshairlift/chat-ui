# Airlift Chat — Angular Port

Production-grade Angular 17+ port of the React `chatuiux.jsx` chat application
(7,419 lines). 100% feature-equivalent: every component, every interaction,
every panel, every keyboard shortcut. Built with Tailwind CSS and Angular
signals throughout.

## Run

```bash
npm install
npm start
```

Then open http://localhost:4200.

## What's in here

- **35+ components** — atoms (Avatar, FileTypeIcon, ToolbarBtn, KpiCard, ModeBadge…),
  conversation-list views (HomeList, MentionsView, ThreadsView, SentView,
  StarredView), the message panel (ConversationHeader, MessageBubble, Composer),
  side panels (Thread, Board, Following, Tasks, Pinned, SharedMedia), the
  global SearchModal, and the HomeDashboard.
- **Central state service** (`ChatStateService`) holding all data via Angular
  signals, with 30+ action methods.
- **Inline rich-text Composer** — bold/italic/underline/strikethrough, headings,
  code blocks, links, blockquotes, lists, color picker, table picker (with
  context-aware row/col operations), @-mention popover with arrow-key
  navigation, emoji picker, drafts per conversation, reply preview.
- **Live thread panel** with per-thread Composer and quote-replies.
- **Cmd+K / Ctrl+K global search** across people, conversations, and message
  text with substring highlighting and ↑↓/Enter navigation.
- **HomeDashboard** (~1,000 lines) — single largest component. Sticky header,
  cascading hero priority banner, role-aware KPI strip, "Today" stats,
  urgent/your queue cards, two-column tasks + AI insights, activity feed,
  resolved-today list. Manual + auto refresh, scroll-to-section KPI clicks.
- **Responsive layout** — desktop 3-column with draggable resize handles
  (260–520px list, 320–640px thread). Tablet drops the NavRail. Mobile uses
  a slide-out drawer for the sidebar and switches between list-only/chat-only
  full-width views as conversations open and close.

## Project structure

```
src/
├── app/
│   ├── app.component.ts           # Top-level layout shell
│   ├── main.ts                    # Bootstrap
│   ├── components/                # 36 standalone components
│   ├── data/                      # Initial conversations, messages, dashboard data
│   ├── models/types.ts            # All TypeScript types
│   ├── pipes/                     # RenderTextPipe, SafeHtmlPipe
│   └── services/                  # ChatStateService, ToastService, BreakpointService
├── styles.css                     # Tailwind + custom animations
└── index.html
```

## Keyboard shortcuts

- **Cmd/Ctrl+K** — open search modal from anywhere
- **Esc** — close any open modal/panel (priority order: search → thread → others)
- **Enter** in composer — send message
- **Shift+Enter** in composer — newline
- **↑/↓** in mention popover or search — navigate suggestions
- **Tab/Enter** in mention popover — accept the highlighted mention
