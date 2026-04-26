# Sidebar actions, Skills, and Configuration mock screens — v1

**Date:** 2026-04-26
**Status:** Approved design, ready for implementation
**Scope:** Frontend only ([apps/fe](../../../apps/fe)). Sidebar restructure plus two new routed mock screens. No backend changes.

## 1. Goal

Three connected UI changes:

1. Promote the two creation actions ("New chat", "New document") from inside the Docs list to a dedicated header block at the top of the sidebar, above the Docs/Sessions tab selector. The "New chat" action becomes the visually dominant primary button so it is discoverable.
2. Pin two new entries — **Skills** and **Configuration** — beneath the chat list when the Sessions tab is active.
3. Both new entries route to mock UI-only screens that take over the doc surface area: a Skills catalogue and an Integrations/Configuration screen.

## 2. Non-goals (v1)

- Real backing logic for Skills (no enable/disable wiring, no add-skill flow).
- Real OAuth/integration wiring (Connect buttons are decorative).
- Persisting which skills/integrations are enabled.
- Search, filter, or pagination on the Skills/Integrations lists.
- Changing assistant or document data models.
- Mobile-specific layouts (existing breakpoints are honoured but not extended).

## 3. Sidebar layout

Updated structure of [sidebar.tsx](../../../apps/fe/src/components/sidebar/sidebar.tsx):

```
┌─ Sidebar ──────────────────┐
│ Patram                  ⊟  │   brand row (existing)
│                            │
│ ┌────────────────────────┐ │
│ │ ⊕  New chat            │ │   primary, accent fill
│ └────────────────────────┘ │
│   ⊕ New document           │   secondary, ghost
│                            │
│ [ Docs | Sessions ]        │   existing SidebarTabs
│                            │
│  …list (Docs or Sessions)… │   existing DocsList / SessionsList
│                            │
│  ── (Sessions tab only) ── │
│  ⚡ Skills                  │   pinned footer rows
│  ⚙  Configuration          │
│                            │
│  [ProfileMenu]             │   existing
└────────────────────────────┘
```

Behaviour rules:

- The top action block renders unconditionally (regardless of which tab is active and regardless of whether a doc is selected).
- The "New document" button is **removed** from inside [docs-list.tsx](../../../apps/fe/src/components/sidebar/docs-list.tsx) because its function moves up. The doc list keeps its search input.
- The Skills/Configuration rows render **only** when `sidebarTab === "sessions"`. They live inside the Sessions list as a pinned, non-scrolling footer block; the chat list above them scrolls.
- Profile menu remains at the very bottom on every tab.

## 4. The two top actions

### 4.1 "New chat" (primary)

- Component: a new `SidebarHeaderActions` block in `apps/fe/src/components/sidebar/sidebar-header-actions.tsx`.
- Click handler does, in order:
  1. `useCreateDoc(user.id)` — create a new untitled document.
  2. `useDocuments().selectDoc(row.id)` — make it the active doc.
  3. `assistantStore.getState().setOpen(true)` — ensure the assistant pane is open.
  - The existing per-doc session bootstrap (added in commit `3791601 — assistant pane follows the active doc`) creates the chat session for the new doc automatically; we do **not** duplicate that wiring here.
- Disabled while the create mutation is pending.
- Style: filled accent button. Uses the existing ink/paper tokens — `bg-(--ink) text-(--paper)` with `hover:bg-(--ink-soft)` and a subtle `shadow-sm`. Full-width inside the sidebar (matches existing button widths). Plus icon at `size-3.5`, label "New chat", `aria-label="New chat"`.
- Keyboard: standard button focus ring; no new shortcut in v1.

### 4.2 "New document" (secondary)

- Same component file, rendered just below "New chat".
- Click handler is the existing `onCreate` from `DocsList` (create + select). It does **not** open the assistant; if Sessions tab is active, the user stays on Sessions.
- Style: ghost button — `text-(--ink-soft) hover:bg-(--paper-soft) hover:text-(--ink)` (visually identical to today's row, just relocated). Full-width, smaller text weight than "New chat".
- `aria-label="New document"`.

### 4.3 No-doc states

Both buttons are always enabled (since both actions create their own doc). There is no "no doc selected" disabled state.

## 5. Skills mock screen

### 5.1 Route

- File: `apps/fe/src/routes/_app/skills.tsx`. Path: `/skills`.
- Mounted via a layout route — see §7.

### 5.2 Page contents

`apps/fe/src/components/skills/skills-page.tsx`:

- **Header row** — title "Skills" on the left; a primary "Add skill" button on the right. The button is decorative (no-op `onClick` in v1; can render a placeholder `Toast` or do nothing).
- **Body** — a responsive grid of skill cards (CSS grid, `minmax(220px, 1fr)`).
- **Skill card** — bordered surface with: icon (lucide-react), name (medium weight), one-line description, and a small "Enabled" pill in the corner. The pill is purely visual; no toggle in v1.
- **Add-skill card** — the final grid cell is a dashed-border placeholder card with a centred "+ Add skill" label, mirroring the header action. Decorative.

### 5.3 Mock data

Hardcoded constant `MOCK_SKILLS` inside the page module. Eight entries, each `{ id, name, description, icon, enabled }`:

| name             | description                                  | icon (lucide)  | enabled |
| ---------------- | -------------------------------------------- | -------------- | ------- |
| Web search       | Look things up on the open web.              | `Globe`        | true    |
| Code interpreter | Run sandboxed Python for analysis.           | `Terminal`     | true    |
| Image generation | Generate images from a prompt.               | `Image`        | false   |
| Calendar lookup  | Read your calendar to suggest times.         | `CalendarDays` | true    |
| PDF parser       | Extract text and tables from PDFs.           | `FileText`     | true    |
| SQL query        | Run read-only queries against connected DBs. | `Database`     | false   |
| Calculator       | High-precision math.                         | `Calculator`   | true    |
| Translate        | Translate text between languages.            | `Languages`    | false   |

## 6. Configuration mock screen

### 6.1 Route

- File: `apps/fe/src/routes/_app/settings.tsx`. Path: `/settings`.

### 6.2 Page contents

`apps/fe/src/components/settings/settings-page.tsx`:

- **Header row** — title "Configuration"; subtitle "Connect this agent to your tools." No action button.
- **Section** — single section labelled "Integrations". (Sub-tabs scaffolding noted as future work but not built — only one section in v1.)
- **Integration row** — left: brand SVG logo at `size-8` in its brand colour, name (medium), one-line description in muted ink. Right: a "Connect" button (decorative, no `onClick` work).

### 6.3 Mock data

Hardcoded constant `MOCK_INTEGRATIONS` inside the page module:

| name         | description                        |
| ------------ | ---------------------------------- |
| Slack        | Post updates and read channels.    |
| Linear       | Create issues, read backlog.       |
| Gmail        | Search and draft email.            |
| Notion       | Read pages, append blocks.         |
| GitHub       | Open PRs, read issues, run checks. |
| Google Drive | Search and attach files.           |
| Jira         | Create and read tickets.           |

### 6.4 Logos

- New file `apps/fe/src/components/settings/integration-logos.tsx` exports a `<IntegrationLogo name={...} />` component.
- Implementation: hand-authored inline SVGs (one per brand). No new npm dependencies. Each SVG is small (≤ 1KB) and uses the brand's primary colour. The component takes a discriminated `name` prop typed against the seven brands; an unknown name is a type error rather than a runtime fallback.

## 7. Routing

### 7.1 Layout route

Refactor so all three top-level views share the sidebar/topbar shell:

- New `apps/fe/src/routes/_app.tsx` — pathless layout route. Renders `<AppShell>` with `<Outlet />` in the main pane (replacing the inline `<DocSurface />`).
- Move existing `apps/fe/src/routes/index.tsx` to `apps/fe/src/routes/_app/index.tsx`. It renders `<DocSurface onSavingChange={...} />` (the saving state is hoisted into the layout — see §7.2).
- Add `apps/fe/src/routes/_app/skills.tsx` rendering `<SkillsPage />`.
- Add `apps/fe/src/routes/_app/settings.tsx` rendering `<SettingsPage />`.
- `apps/fe/src/routeTree.gen.ts` is regenerated by the TanStack Router plugin during `vp dev` / `vp build`.

### 7.2 AppShell changes

- Remove the inline `<DocSurface />` mount; render `<Outlet />` inside the existing `min-w-0 flex-1 overflow-y-auto` div.
- The `saving` state currently owned by `AppShell` moves to a small zustand slice in [stores/ui.ts](../../../apps/fe/src/stores/ui.ts) (`saving: boolean`, `setSaving: (v) => void`) so `DocSurface` can write it and `Topbar` can read it without prop drilling. Skills/Settings pages don't touch it; the topbar shows "idle" on those routes.
- Keyboard handlers (`Ctrl+\` collapse, `Ctrl+/` toggle assistant) stay on `AppShell` and apply on every route.
- The assistant pane (`<aside aria-label="Assistant">`) stays mounted inside `AppShell` so it remains visible/usable on every route. Whether that is desirable on `/skills` and `/settings` is decided by `assistantStore.open` — out of scope to gate per route in v1.

### 7.3 Sidebar links

- Skills/Configuration rows are TanStack Router `<Link to="/skills">` / `<Link to="/settings">`. They use `activeProps={{ className: ... }}` to highlight the active route with the same `bg-(--selection)` styling already used by `DocRow` / `SessionRow`.

## 8. Files touched

**New**

- `apps/fe/src/components/sidebar/sidebar-header-actions.tsx`
- `apps/fe/src/components/sidebar/skills-link.tsx` and `configuration-link.tsx` (or one shared `nav-link.tsx`)
- `apps/fe/src/components/skills/skills-page.tsx`
- `apps/fe/src/components/settings/settings-page.tsx`
- `apps/fe/src/components/settings/integration-logos.tsx`
- `apps/fe/src/routes/_app.tsx`
- `apps/fe/src/routes/_app/index.tsx`
- `apps/fe/src/routes/_app/skills.tsx`
- `apps/fe/src/routes/_app/settings.tsx`

**Modified**

- `apps/fe/src/components/sidebar/sidebar.tsx` — mount `SidebarHeaderActions` above `SidebarTabs`.
- `apps/fe/src/components/sidebar/docs-list.tsx` — remove the inline "+ New document" button and the `useCreateDoc` hook (action moves up).
- `apps/fe/src/components/sidebar/sessions-list.tsx` — append the Skills/Configuration footer block.
- `apps/fe/src/components/app-shell.tsx` — replace inline `<DocSurface />` with `<Outlet />`; hoist `saving` to the UI store.
- `apps/fe/src/components/topbar.tsx` — read `saving` from the UI store instead of prop.
- `apps/fe/src/components/doc/doc-surface.tsx` — write `saving` to the UI store instead of prop.
- `apps/fe/src/stores/ui.ts` — add `saving` slice (not persisted).

**Deleted**

- `apps/fe/src/routes/index.tsx` — replaced by `_app/index.tsx`.

## 9. Tests

**New**

- `apps/fe/src/components/sidebar/sidebar-header-actions.test.tsx` —
  - renders both buttons with correct labels;
  - clicking "New chat" calls the document-create mutation and opens the assistant;
  - clicking "New document" creates a doc and does **not** open the assistant.
- `apps/fe/src/components/skills/skills-page.test.tsx` — renders the title, the "Add skill" header button, all eight mock skills, and the "+ Add skill" placeholder card.
- `apps/fe/src/components/settings/settings-page.test.tsx` — renders the title and a row per mock integration with a "Connect" button.

**Updated**

- `apps/fe/src/components/app-shell.test.tsx` — the test `"switching to Sessions tab shows the New chat button"` is replaced with `"renders the New chat button regardless of active tab"` (asserts the button is present on both Docs and Sessions tabs). The existing `"mounts with brand, search, and new-doc button"` test asserts the New document button now lives in the sidebar header rather than the docs list.
- Existing `docs-list.test.tsx` (if any assertions reference the "New document" button) — drop those assertions.

## 10. Open trade-offs

- **Logos as inline SVG vs. a `simple-icons` dep:** chose inline SVG to avoid adding a dependency for a mock screen. If the integrations screen becomes real, swap to `simple-icons` then.
- **Routing refactor cost:** introducing `_app` layout adds one indirection but is the idiomatic TanStack Router way to share a shell. The alternative (passing a `view` prop into `AppShell` per route, no router) hides the URLs — chose routing because it matches the v1 goal of `/skills` and `/settings` being real, deep-linkable destinations.
- **Assistant pane on `/skills` and `/settings`:** kept globally available (controlled by `assistantStore.open`) rather than auto-closed on those routes. Auto-closing is easy to add later if it feels wrong in use.
