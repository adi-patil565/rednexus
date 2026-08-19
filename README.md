# RedNexus

On-demand blood donor mobilisation and alert platform.

## Structure

- `apps/web` — Next.js donor-facing site (shadcn/ui + Tailwind)
- `apps/mobile` — Expo donor app + hospital/bloodbank dashboards (React Native Paper)
- `packages/api` — Shared Axios + TanStack Query client
- `packages/store` — Shared Zustand state
- `packages/types` — Shared TypeScript types, generated from FastAPI OpenAPI schema
- `packages/validators` — Shared Zod schemas
- `packages/design-tokens` — Colors, spacing, radii, font sizes
- `packages/utils` — Formatters and blood-group helpers

## Getting started

```bash
pnpm install
pnpm dev
```

## Regenerate types after backend schema changes

```bash
pnpm gen:types
```
