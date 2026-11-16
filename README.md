<div align="center">

<img src="sri-saraswathy-musicals/public/Logo.png" alt="Sri Saraswathy Musicals" width="360" />

### Online store, counter billing and shop management<br/>for a three-branch musical instrument retailer in Chennai

<br/>

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Postgres](https://img.shields.io/badge/Neon_Postgres-00E599?style=for-the-badge&logo=postgresql&logoColor=black)
![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)
![Razorpay](https://img.shields.io/badge/Razorpay-0C2451?style=for-the-badge&logo=razorpay&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

**[Features](#-features)** ·
**[Getting started](#-getting-started)** ·
**[Commands](#-commands)** ·
**[Project layout](#-project-layout)** ·
**[Good to know](#-good-to-know)**

</div>

<br/>

> 📍 **Vadapalani · Porur · Ashok Nagar** &nbsp;|&nbsp; 🕙 Monday to Sunday, 10:00 – 20:00

One app does it all: the customer storefront, the staff billing counter, stock across branches, repair tickets, vendor purchases, GST reports and an admin dashboard.

The app lives in [`sri-saraswathy-musicals/`](sri-saraswathy-musicals). Every command below is run from that folder.

---

## ✨ Features

| | Area | Highlights |
| :-: | :-- | :-- |
| 🛍️ | **Storefront** | Catalogue with variants, finishes, galleries and specs · server-priced cart and checkout · Razorpay payments · Google sign-in · order history · emailed receipts |
| 🧾 | **Billing and sales** | Walk-in billing per branch · split payments · GST tax invoices · A4 and thermal print · quotations that become invoices |
| 📦 | **Inventory** | Stock per variant per branch · low-stock alerts · movement log · inter-branch transfers |
| 🤝 | **Purchasing** | Vendors · purchase bills · stock inward · vendor payments and balances |
| 🔧 | **Repairs** | Tickets from received to completed · technician and deadline alerts · advances · parts used · WhatsApp updates |
| 📊 | **Admin** | Sales and purchase analytics · expenses · GST reports · customers · coupons · delivery tariffs · site media |

<details>
<summary><b>🛍️ Storefront in detail</b></summary>

<br/>

- Cart and checkout are priced by the server, so the total shown is always the total charged: GST, delivery by weight and destination state, and coupons.
- **No branch choice at checkout.** Stock is checked across all branches together. When an order is placed, stock is taken from whichever branch holds it. If no single branch has enough, it is drained from the branches with the most. The order records the branch that supplied the most units, so staff know where to dispatch from.
- Razorpay signature verification, plus a webhook so a paid order is still recorded if the customer closes the tab.
- Google sign-in, saved addresses, order history and an emailed receipt.
- A home-page gallery of shop photos and videos above the reviews. Four photos first, "View more" for the rest, then up to four looping silent videos with a mute/unmute button.

</details>

<details>
<summary><b>🧾 Counter billing in detail</b></summary>

<br/>

- Discounts, coupons, split payments and printable receipts.
- GST tax invoices with CGST, SGST and IGST.
- A bill takes its stock out of the branch it is made at, and is refused if that branch is short. Cancelling it puts the stock back.

</details>

<details>
<summary><b>🔧 Repairs in detail</b></summary>

<br/>

- Tickets move from received to completed with a timeline, technician, deadline alerts, advance payments and parts used.
- The customer gets WhatsApp updates and a numbered service invoice at the end.

</details>

<details>
<summary><b>🔐 Access levels</b></summary>

<br/>

- **Full admins** see everything, including Site Media.
- **Branch staff** see only the operational pages for their branch.

</details>

### 🖼️ Site media limits

| | Photos | Videos |
| :-- | :-: | :-: |
| Maximum count | 12 | 4 |
| Maximum size each | 5 MB | 15 MB |
| Formats | JPG, PNG, WebP | MP4, WebM, MOV |

- Photos are shrunk to WebP in the browser before upload.
- Files are stored in the database in 2 MB pieces, so each upload stays under Vercel's 4.5 MB request limit.
- Each file's link carries a version number and is cached for a year. Videos load only when scrolled into view and are served in ranges.
- Portrait 9:16 videos are shown uncropped.

---

## 🚀 Getting started

**You need:** Node.js 20 or newer, and a free [Neon](https://neon.tech) Postgres database.

```bash
cd sri-saraswathy-musicals
npm install
cp .env.example .env.local           # then fill it in (see below)
npm run db:migrate                   # create the tables
npm run db:seed                      # optional: demo catalogue and data
npm run admin:set -- you@gmail.com   # make yourself an admin (sign in once first)
npm run dev
```

Open **[localhost:3000](http://localhost:3000)**. The admin area is at `/admin`.

### Environment variables

| Variable | Needed for |
| :-- | :-- |
| `DATABASE_URL` | Neon connection string (pooled, with `?sslmode=require`). **Required.** |
| `APP_URL`, `NEXT_PUBLIC_APP_URL` | Public address of the site, e.g. `http://localhost:3000` |
| `AUTH_SECRET` | Signs the login cookie. Generate with `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in (see `AUTH.md`) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_WEBHOOK_SECRET` | Online checkout. Use test keys while developing |
| `RESEND_API_KEY`, `ORDER_FROM_EMAIL` | Order confirmation emails |

The gallery needs nothing extra: it uses the same database.

---

## ⌨️ Commands

| Command | What it does |
| :-- | :-- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Run the tests (against an in-memory Postgres) |
| `npm run lint` | Lint the code |
| `npm run db:generate` | Create a migration from changes to `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run admin:set -- <email>` | Grant admin rights to an account |

---

## 🗂️ Project layout

```
sri-saraswathy-musicals/
├── src/
│   ├── app/
│   │   ├── (shop)/            storefront: home, shop, product, cart, checkout, profile
│   │   ├── admin/             billing, orders, inventory, service, media, analytics…
│   │   └── api/               route handlers: auth, checkout, orders, pos, media, stock…
│   ├── components/            home sections, admin UI, shared UI
│   └── lib/
│       ├── db/                schema, queries, seed
│       ├── checkout/          server-side pricing, fulfilment, payment finalising
│       ├── media/             limits and upload helpers for site media
│       ├── data/business.ts   shop name, branches, phones, opening hours
│       └── stock.ts           branch and stock helpers
├── drizzle/                   SQL migrations (committed)
├── scripts/                   maintenance scripts
└── docs/                      change notes and a test guide
```

---

## 💡 Good to know

- 💰 **Money is stored in paise** (₹1 = 100 paise) as integers, and weights in grams, so there are no rounding errors.
- 🛡️ **Stock can never go below zero.** Every stock change is one guarded database update, so two customers can't both buy the last item.
- 🏪 **Shop details live in one file:** `src/lib/data/business.ts` (branches, phones, hours, GSTIN).
- ➕ **Adding a branch** means adding it to that file and running a migration that widens the branch checks.
- ☁️ **Deploying:** built for Vercel. Run `npm run db:migrate` against the production database before deploying a release that adds migrations.

📚 More detail: [`BACKEND.md`](sri-saraswathy-musicals/BACKEND.md) (database and API) · [`AUTH.md`](sri-saraswathy-musicals/AUTH.md) (Google, Razorpay, email) · [`docs/CHANGES-AND-TEST-GUIDE.md`](sri-saraswathy-musicals/docs/CHANGES-AND-TEST-GUIDE.md)

---

<div align="center">

Private and proprietary. Built for **Sri Saraswathy Musicals**. All rights reserved.

</div>
