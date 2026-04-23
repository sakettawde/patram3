# patram3

A Vite+ monorepo with:

- [apps/fe](apps/fe) — TanStack Start (React) frontend, deployed to Cloudflare Workers
- [apps/be](apps/be) — Hono backend, deployed to Cloudflare Workers
- [packages/utils](packages/utils) — shared utilities

## Development

Install dependencies:

```bash
vp install
```

Run a single app:

```bash
vp run fe#dev   # frontend on port 3000
vp run be#dev   # backend (wrangler dev)
```

Check, test, build (all workspaces):

```bash
vp run ready     # fmt + lint + test + build
vp run test -r
vp run build -r
```

## Deploy (Cloudflare)

```bash
vp run fe#deploy
vp run be#deploy
```
