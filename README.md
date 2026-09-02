# PDF Invoice Renamer

Upload scanned Hungarian vet-clinic invoice PDFs, have them OCR'd and parsed
automatically, review/correct the suggested filename in the browser, and
download the renamed files. Fully hosted on Cloudflare.

See [PROJECT_SPEC.md](./PROJECT_SPEC.md) for the full design.

## Layout

- `apps/worker` — Hono API, deployed as a Cloudflare Worker
- `apps/web` — React + shadcn/ui, built with Vite, served as Worker static assets
- `apps/ocr-service` — Python OCR pipeline (PyMuPDF + Tesseract), deployed as a Cloudflare Container
- `libs/shared-types` — TypeScript types shared between `worker` and `web`

## Getting started

```bash
bun install
bunx nx run ocr-service:build   # build the OCR service
bunx nx run worker:dev          # wrangler dev, serving the Hono API locally
bunx nx run web:dev             # vite dev server
bunx nx run-many -t build       # build all three apps
```

## Deploying

CI (`.github/workflows/ci.yml`) lints, tests, and builds affected projects on
every push/PR to `main`. Nothing deploys from `main`.

Deploys only happen on a version tag push (`.github/workflows/deploy.yml`):

```bash
git tag v1.0.0
git push origin v1.0.0
```

This builds all apps and runs `wrangler deploy` from `apps/worker`, which
ships the Worker, the built web assets, and the OCR Container image in one
step.
