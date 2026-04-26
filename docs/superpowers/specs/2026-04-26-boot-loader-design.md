# Boot loader design

## Problem

On a returning visit to the app, the "What should we call you?" prompt flashes for a moment before the editor appears. The cause is an SSR/hydration mismatch in `apps/fe/src/auth/auth-gate.tsx`:

- During server-side render (TanStack Start), `localStorage` is unavailable, so `useStoredUserId()` returns `null`.
- With `userId === null`, `AuthGate` server-renders `<NamePrompt>` ("What should we call you?").
- The browser paints that HTML, then client hydration reads localStorage, finds the stored id, and re-renders into `<Splash>` ("Loading…") and finally the app.

The user-visible result is a flash of the name-prompt screen for returning visitors. The interim "Loading…" splash is also bare and unbranded.

## Goal

Replace the flash and the bare `<Splash>` with a calm, branded boot loader: an animated "patram" wordmark that fades in, and — only if the load drags on past the intro animation — gently pulses to signal that work is still happening.

## Non-goals

- No changes to the auth flow itself (NamePrompt copy, validation, create-user mutation).
- No changes to error handling. `<ErrorState>` remains as the failure surface — the loader is for loading, not for errors.
- No new dependency. Pure CSS animation.

## Approach

Two coordinated changes:

### 1. Hydration gate in `AuthGate`

Add a `hydrated` flag that starts `false` and flips `true` inside a `useEffect`. While `!hydrated`, render the new `<BootLoader>` regardless of stored auth state. The server and the first client paint will therefore always render the loader — never `NamePrompt` — eliminating the flash.

Updated render order:

```ts
const [hydrated, setHydrated] = useState(false);
useEffect(() => setHydrated(true), []);

if (!hydrated) return <BootLoader />;
if (!userId) return <NamePrompt onCreated={(u) => setUserId(u.id)} />;
if (query.isPending) return <BootLoader />;
if (query.error?.status === 404) return <NamePrompt onCreated={(u) => setUserId(u.id)} />;
if (query.error) return <ErrorState message={query.error.message} />;
if (!query.data) return <BootLoader />;
return <UserContext.Provider value={query.data}>{children}</UserContext.Provider>;
```

The existing `<Splash>` component is removed; all loading states route through `<BootLoader>`.

### 2. New `BootLoader` component

A new file `apps/fe/src/components/boot-loader.tsx`. Single responsibility: render a centered "patram" wordmark with the boot animation.

Markup:

```tsx
<div
  role="status"
  aria-live="polite"
  aria-label="Loading"
  className="flex min-h-svh items-center justify-center px-6"
>
  <span className="boot-loader__wordmark">patram</span>
</div>
```

Visuals:

- Centered on the existing `--paper` background, matching the `Centered` helper in `auth-gate.tsx`.
- Wordmark uses Inter (already loaded), `~28px`, weight `500`, `letter-spacing -0.01em`, color `--ink`.

Animations (added to `apps/fe/src/styles.css`):

- `boot-intro` — runs once on mount, `0.6s ease-out`. Fades in (opacity `0 → 1`), settles vertically (`translateY(4px) → 0`), and tightens letter-spacing (`-0.04em → -0.01em`). Subtle "settle in" feel.
- `boot-pulse` — `2s ease-in-out infinite`, opacity `1 → 0.55 → 1`, applied with `animation-delay: 900ms`. The delay means the pulse only becomes visible if the loader is still mounted past the intro window. Both animations are declared in the same `animation:` shorthand; the pulse simply has an idle pre-roll.
- `prefers-reduced-motion: reduce` — both animations are disabled; the wordmark renders statically at full opacity.

The component does not concern itself with the outro. When `AuthGate` swaps to the next state, React unmounts `<BootLoader>` and the next view appears. If we later want a softer crossfade we can layer a wrapper transition; not needed for v1.

## Files touched

- `apps/fe/src/components/boot-loader.tsx` — new.
- `apps/fe/src/auth/auth-gate.tsx` — add `hydrated` state, replace `<Splash>` references with `<BootLoader>`, delete the now-unused `Splash` function.
- `apps/fe/src/styles.css` — add `.boot-loader__wordmark` styles, `@keyframes boot-intro`, `@keyframes boot-pulse`, and a `prefers-reduced-motion` block.
- `apps/fe/src/components/boot-loader.test.tsx` — new. Asserts the component renders with `role="status"` and includes the wordmark text.

## Tests

Automated:

- New `boot-loader.test.tsx`: renders `<BootLoader />`, asserts `getByRole("status")` is in the document and contains the text "patram".
- Existing `app-shell.test.tsx` is not expected to need changes (it mocks past the auth gate).

Manual (must run dev server and check in a browser):

- Hard reload as a returning user → no NamePrompt flash; loader appears briefly; app appears.
- Clear localStorage, hard reload → loader appears briefly; NamePrompt appears (no intermediate flash).
- DevTools network throttling on "Slow 3G" → the pulse animation kicks in after ~0.9s and continues until the load completes.
- OS-level "reduce motion" enabled → wordmark renders statically with no animation.

## Open questions

None.
