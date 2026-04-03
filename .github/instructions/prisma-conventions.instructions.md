---
applyTo: "prisma/**"
description: "Use when editing Prisma schema, creating migrations, seeding data, or working with database models. Covers SQLite constraints, migration rules, and prediction engine conventions."
---
# Prisma & Database Conventions

## Migration rules

- **Never use `db push`** — the npm script intentionally errors. Always use `npm run db:migrate`.
- All migrations are **additive** — never drop columns in production.
- Run `npm run db:generate` after schema changes to regenerate the Prisma client.
- Migration workflow: edit `schema.prisma` → `npm run db:migrate` → name the migration descriptively.

## SQLite constraints

- **No concurrent writes.** Nightly pipeline steps are sequential by design.
- Provider is `sqlite` with `DATABASE_URL` from `.env` (typically `file:./dev.db`).
- No native enums — use `String` fields with application-level validation.

## Schema conventions

- **Prediction engine fields are nullable** (`Float?`). The system must work identically when all are `null`.
- Add `@@index` on foreign keys (`userId`, `stockId`, `scanId`) and frequently queried fields.
- Use `@default(now())` for `createdAt`, `@updatedAt` for `updatedAt`.
- Use `cuid()` for string IDs, `autoincrement()` for integer IDs.
- Cascade deletes (`onDelete: Cascade`) for child records that have no meaning without their parent.

## Current scale

- 69 tables total.
- ~268 tickers in the universe.

## Seed files

- `prisma/seed.ts` — main seed (runs via `npm run db:seed`)
- `prisma/seed-tags.ts`, `sync-categories.ts`, `sync-yahoo-tickers.ts` — supplementary data scripts
