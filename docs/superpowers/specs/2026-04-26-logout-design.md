# Log out from device — v1

**Date:** 2026-04-26
**Status:** Approved design, ready for implementation
**Scope:** Single-component change to [profile-menu.tsx](../../../apps/fe/src/components/profile-menu.tsx). No backend changes.

## 1. Goal

Let a user end their session on a device. The server has no notion of a session — identity is just a localStorage `userId` sent via `X-User-Id`. "Log out" therefore means: clear local state, boot back to `NamePrompt`. Server data is untouched.

## 2. Non-goals (v1)

- Server-side session invalidation (no server sessions to invalidate).
- Log-out-on-all-devices.
- Modal / `AlertDialog` confirmation surface.
- Idle / auto-logout, session timeouts.

## 3. Surface

Single entry point: the existing `ProfileMenu` dropdown. Below the "Copy code" row, a subdued **"Log out"** link-style button.

## 4. Behaviour

The dropdown panel has a local `view` state with two values: `"default"` (today's content) and `"confirm-logout"`.

- **`view === "default"`** — current behaviour, plus a new "Log out" button at the bottom.
- **Clicking "Log out"** sets `view = "confirm-logout"`. The panel body morphs in place (no modal, no overlay):
  - Heading: _"Log out of this device?"_
  - One-line reminder: _"You'll need your code to come back."_
  - The user's code in the same monospaced style as the default view, with a Copy button.
  - Two buttons: **Confirm log out** (subdued destructive style) and **Cancel** (neutral).
- **Cancel** sets `view = "default"`. The dropdown stays open.
- **Confirm log out** does, in order:
  1. `window.localStorage.removeItem(USER_ID_STORAGE_KEY)` (the constant from [auth/types.ts](../../../apps/fe/src/auth/types.ts)).
  2. `window.location.reload()`.
- Closing the dropdown (clicking the trigger button again) while in confirm view resets `view = "default"` so it reopens cleanly next time.

The reload guarantees a clean slate: React Query cache, Zustand stores (assistant sessions, selected doc, sidebar tab), and any in-flight `useUpdateDoc` debounce timers are all dropped. `AuthGate` reads `null` from `useStoredUserId` and renders `NamePrompt`.

## 5. Files touched

- `apps/fe/src/components/profile-menu.tsx` — add the `view` state, the "Log out" button in the default view, and the confirm view body.
- `apps/fe/src/components/profile-menu.test.tsx` — two new tests (see §6).

## 6. Tests

- **Existing tests** — must still pass:
  - Renders the user's name and reveals the code on open.
  - Copy button writes the code to the clipboard.
- **New tests:**
  1. Clicking "Log out" reveals the confirm view: heading "Log out of this device?", the user's code is still visible, and a "Confirm log out" button is present.
  2. Clicking "Confirm log out" calls `localStorage.removeItem(USER_ID_STORAGE_KEY)` and `location.reload`. Both stubbed via `vi.spyOn` / `Object.defineProperty`.

Manual:

- Log in (or paste a code), open the profile menu, click Log out → confirm view appears with the code.
- Click Cancel → returns to default view.
- Click Log out → Confirm log out → the page reloads and `NamePrompt` is shown.
- Paste the code in NamePrompt → the previous user's docs reappear, confirming server data was not touched.

## 7. Risks and follow-ups

- A user who hits Confirm without saving their code is locked out. The confirm view shows the code prominently to mitigate. If we later add real auth (email/OAuth), this whole flow can be replaced.
- `window.location.reload()` is brutal but reliable. If the boot-loader flash becomes a complaint, a programmatic reset (queryClient.clear() + per-store reset functions) is a forward-compatible change with no schema impact.
