# Sri Saraswathy Musicals

Online store, counter billing and shop management for a three-branch musical instrument retailer in Chennai (Vadapalani, Porur, Ashok Nagar), open Monday to Sunday, 10:00 to 20:00.

One app does it all: the customer storefront, the staff billing counter, inventory across branches, repair tickets, vendor purchases, GST reports and an admin dashboard.

**Stack:** Next.js 16 (App Router) · React 18 · Tailwind CSS · Drizzle ORM on Neon Postgres · Razorpay · Resend · Google sign-in.

The app lives in [`sri-saraswathy-musicals/`](sri-saraswathy-musicals). Every command below is run from that folder.

---

## What's inside

### Storefront (customers)
- Product catalogue with variants, finishes, photo galleries and specs.
- Cart and checkout that are priced by the server, so the total shown is always the total charged: GST, delivery by weight and destination state, and coupons.
- **No branch choice at checkout.** Stock is checked across all branches together. When an order is placed, stock is taken from whichever branch holds it. If no single branch has enough, it is drained from the branches with the most. The order records the branch that supplied the most units, so staff know where to dispatch from.
- Online payment through Razorpay with signature verification, plus a webhook so a paid order is still recorded if the customer closes the tab.
- Google sign-in, saved addresses, order history, and an emailed receipt.
- A home-page gallery of shop photos and videos, shown just above the reviews. Four photos first, "View more" for the rest, then up to four looping silent videos that open with a mute/unmute button.

### Counter billing and sales (staff)
- Walk-in billing per branch, with discounts, coupons, split payments and printable receipts.
- GST tax invoices (CGST, SGST, IGST), A4 and thermal print layouts.
- Quotations that convert into invoices.
- A bill takes its stock out of the branch it is made at, and is refused if that branch is short. Cancelling it puts the stock back.

### Inventory and purchasing
- Stock tracked per variant per branch, with low-stock alerts and a movement log.
- Inter-branch stock transfers.
- Vendors, purchase bills, stock inward, vendor payments and outstanding balances.

### Repairs and service
- Tickets from received to completed, with technician, deadline alerts, advance payments, parts used and a timeline.
- WhatsApp updates to the customer and a numbered service invoice at the end.

### Admin
- Sales and purchase analytics, expenses, GST reports, customers, inquiries, coupons and delivery tariffs.
- **Site Media** (admin only): upload, replace and delete the home-page photos and videos.
- Two access levels. Full admins see everything. Branch staff see only the operational pages for their branch.

---

## Site media limits

| | Photos | Videos |
| :-- | :-- | :-- |
| Maximum count | 12 | 4 |
| Maximum size each | 5 MB | 15 MB |
| Formats | JPG, PNG, WebP | MP4, WebM, MOV |

- Photos are shrunk to WebP in the browser before upload.
- Files are stored in the database in 2 MB pieces, so each upload request stays under Vercel's 4.5 MB request limit.
- Each file's link carries a version number and is cached for a year, so browsers and the CDN don't ask the database again. Videos load only when scrolled into view and are served in ranges.
- Portrait 9:16 videos are shown uncropped.

---

## Getting started

**You need:** Node.js 20 or newer, and a free [Neon](https://neon.tech) Postgres database.

```bash
cd sri-saraswathy-musicals
npm install
cp .env.example .env.local     # then fill it in (see below)
npm run db:migrate             # create the tables
npm run db:seed                # optional: demo catalogue and data
npm run admin:set -- you@gmail.com   # make yourself an admin (sign in once first)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The admin area is at `/admin`.

### Environment variables

| Variable | Needed for |
| :-- | :-- |
| `DATABASE_URL` | Neon connection string (the pooled one, with `?sslmode=require`). Required. |
| `APP_URL`, `NEXT_PUBLIC_APP_URL` | The public address of the site, e.g. `http://localhost:3000`. |
| `AUTH_SECRET` | Signs the login cookie. Generate with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. See `AUTH.md`. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_WEBHOOK_SECRET` | Online checkout. Use test keys while developing. |
| `RESEND_API_KEY`, `ORDER_FROM_EMAIL` | Order confirmation emails. |

Nothing else is needed for the gallery: it uses the same database.

---

## Commands

| Command | What it does |
| :-- | :-- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Run the test suite (runs against an in-memory Postgres) |
| `npm run lint` | Lint the code |
| `npm run db:generate` | Create a migration from changes to `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run admin:set -- <email>` | Grant admin rights to an account |

---

## Project layout

```
sri-saraswathy-musicals/
├── src/
│   ├── app/
│   │   ├── (shop)/        storefront: home, shop, product, cart, checkout, profile
│   │   ├── admin/         admin pages: billing, orders, inventory, service, media, analytics…
│   │   └── api/           route handlers (auth, checkout, orders, pos, media, stock…)
│   ├── components/        home sections, admin UI, shared UI
│   └── lib/
│       ├── db/            schema, queries, seed
│       ├── checkout/      server-side pricing, fulfilment, payment finalising
│       ├── media/         limits and upload helpers for site media
│       ├── data/business.ts   shop name, branches, phone numbers, opening hours
│       └── stock.ts       branch and stock helpers
├── drizzle/               SQL migrations (committed)
├── scripts/               maintenance scripts
└── docs/                  change notes and a test guide
```

---

## Things worth knowing

- **Money is stored in paise** (₹1 = 100 paise) as integers, and weights in grams, so there are no rounding errors.
- **Stock can never go below zero.** Every stock change is one guarded database update, so two customers can't both buy the last item.
- **Shop details live in one file:** `src/lib/data/business.ts` (branches, phones, hours, GSTIN). Change them there.
- **Adding a branch** means adding it to that file and running a migration that widens the branch checks.
- **Deploying:** the app is built for Vercel. Run `npm run db:migrate` against the production database before deploying a release that adds migrations.

More detail: `BACKEND.md` (database and API), `AUTH.md` (Google, Razorpay and email setup), `docs/CHANGES-AND-TEST-GUIDE.md`.

---

## License

Private and proprietary. Built for Sri Saraswathy Musicals. All rights reserved.
