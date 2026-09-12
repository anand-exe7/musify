# Backend — Neon (Postgres) + Drizzle

The app is backed by a serverless Postgres database on [Neon](https://neon.tech),
accessed through [Drizzle ORM](https://orm.drizzle.team) over Neon's HTTP driver.
This document covers setup and the HTTP API. The frontend pages still read their
demo data from the client stores today — see **Wiring the frontend** at the end.

## Setup

1. **Create a Neon project** at https://neon.tech and copy the connection string
   (Dashboard → *Connection Details*). Use the **pooled** string (contains
   `-pooler`) and keep `?sslmode=require`.

2. **Configure the env.** Copy `.env.example` to `.env.local` and paste your
   string as `DATABASE_URL`. `.env.local` is gitignored — the secret never gets
   committed.

3. **Create the tables and seed the demo data:**

   ```bash
   npm run db:migrate   # apply the SQL migrations in drizzle/
   npm run db:seed      # load the demo catalog, users, tickets, etc.
   ```

4. **Run the app** with `npm run dev`. The API lives under `/api/*`.

## Scripts

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run db:generate` | Generate a new SQL migration from `src/lib/db/schema.ts` |
| `npm run db:migrate`  | Apply pending migrations to the database                 |
| `npm run db:push`     | Push the schema directly (dev only, skips migrations)    |
| `npm run db:studio`   | Open Drizzle Studio (a GUI over the data)                |
| `npm run db:seed`     | Clear and re-insert the demo data (idempotent)           |

## Layout

```
drizzle/                      generated SQL migrations (committed)
drizzle.config.ts             drizzle-kit config
src/lib/db/
  schema.ts                   all 17 tables (source of truth)
  index.ts                    the Drizzle client — import { db } from "@/lib/db"
  seed.ts                     demo-data seeder
  queries/                    typed CRUD per entity, returns the app's TS types
src/lib/api/http.ts           JSON response helpers for route handlers
src/app/api/**/route.ts       the REST endpoints
```

## API reference

All endpoints return JSON. Collections support `GET` (list) and `POST` (create);
item routes support `GET`/`PATCH`/`DELETE` (a `PATCH` takes a partial object).

| Resource            | Collection                         | Item                                    |
| ------------------- | ---------------------------------- | --------------------------------------- |
| Products            | `GET,POST /api/products`           | `GET,PATCH,DELETE /api/products/:id`    |
| Product by slug     | —                                  | `GET /api/products/slug/:slug`          |
| Categories          | `GET,POST /api/categories`         | `GET,DELETE /api/categories/:id`        |
| Users               | `GET,POST /api/users`              | `GET,PATCH,DELETE /api/users/:id`       |
| Staff               | `GET,POST /api/staff`              | `PATCH,DELETE /api/staff/:id`           |
| Orders              | `GET,POST /api/orders`             | `GET,PATCH,DELETE /api/orders/:id`      |
| Invoices (sales)    | `GET,POST /api/invoices`           | `GET,PATCH,DELETE /api/invoices/:id`    |
| Vendors             | `GET,POST /api/vendors`            | `GET,PATCH,DELETE /api/vendors/:id`     |
| Inquiries           | `GET,POST /api/inquiries`          | `GET,PATCH,DELETE /api/inquiries/:id`   |
| Repair tickets      | `GET,POST /api/repair`             | `GET,PATCH,DELETE /api/repair/:id`      |
| Next service inv. № | `POST /api/repair/next-invoice`    | —                                       |
| POS bills           | `GET,POST /api/pos/bills`          | `DELETE /api/pos/bills/:id`             |
| POS inventory       | `GET,POST /api/pos/inventory`      | `PATCH,DELETE /api/pos/inventory/:id`   |
| Coupons             | `GET,POST /api/pos/coupons`        | `PATCH,DELETE /api/pos/coupons/:code`   |
| POS categories      | `GET,POST /api/pos/categories`     | `DELETE /api/pos/categories/:name`      |
| GST settings        | `GET,PATCH /api/settings/gst`      | —                                       |
| Delivery settings   | `GET,PATCH /api/settings/delivery` | —                                       |
| Delivery zones      | `GET,POST /api/settings/delivery/zones` | `PATCH,DELETE /api/settings/delivery/zones/:id` |

For the repair `PATCH`, the body may be either a bare partial ticket or
`{ "patch": { ... }, "eventLabel": "Status → Ready" }` to also append a timeline
event and bump `updatedAt`.

## Server-side access (no HTTP)

In Server Components and scripts you can skip the HTTP layer and call the query
functions (or Drizzle) directly:

```ts
import { getFeaturedProducts } from "@/lib/db/queries/products";

export default async function Page() {
  const featured = await getFeaturedProducts();
  // ...
}
```

## Wiring the frontend (next step)

Today the storefront/admin pages still hydrate from the static `src/lib/data/*`
files and persist their working state to `localStorage` via the Zustand stores.
The query layer returns the exact same TypeScript shapes those pages already use,
so switching a page to the database is a drop-in: replace the static import with
a `fetch('/api/…')` (client) or a direct query call (server component). This
migration is intentionally not done yet, so the UI keeps working before the DB
is connected.
