# 🎵 Sri Saraswathy Musicals

An end-to-end modern **E-Commerce Storefront**, **Multi-Branch Point-of-Sale (POS)**, **Repair & Service Ticketing System**, and **ERP Management Platform** designed for Indian musical instrument retail.

Built with **Next.js 16 (App Router)**, **React 18**, **Tailwind CSS**, **Drizzle ORM**, **Neon Serverless PostgreSQL**, **Razorpay**, and **Resend**.

---

## 📑 Table of Contents

- [Features Overview](#-features-overview)
  - [1. Storefront & Customer Experience](#1-storefront--customer-experience)
  - [2. Point of Sale (POS) & Billing](#2-point-of-sale-pos--billing)
  - [3. Inventory & Multi-Branch Stock](#3-inventory--multi-branch-stock)
  - [4. Instrument Repair & Service Ticketing](#4-instrument-repair--service-ticketing)
  - [5. Vendor Management & Stock Inward](#5-vendor-management--stock-inward)
  - [6. Admin, Analytics & Compliance](#6-admin-analytics--compliance)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Database & Money Handling](#-database--money-handling)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation & Setup](#installation--setup)
  - [Database Migration & Seeding](#database-migration--seeding)
  - [Setting Up Admins](#setting-up-admins)
- [Available Scripts](#-available-scripts)
- [Project Directory Structure](#-project-directory-structure)
- [Environment Variables](#-environment-variables)
- [License](#-license)

---

## 🚀 Features Overview

### 1. Storefront & Customer Experience
* **Dynamic Product Catalog**: Browse traditional Indian Classical instruments (Veena, Mridangam, Tanpura, Harmonium, Sitar, Flutes) and Western instruments (Keyboards, Violins, Guitars, Saxophones, Percussion).
* **Rich Product Pages**: Image galleries, technical specifications, audio/feature highlights, and customer reviews.
* **Shopping Cart & Checkout**: Real-time stock verification, coupon code validation, and dynamic delivery cost calculation based on parcel weight and destination state.
* **Razorpay Payment Gateway**: Seamless UPI, NetBanking, Credit/Debit cards, and Wallet checkout with server-side signature verification.
* **Customer Authentication & Profiles**: Google OAuth login, multiple saved delivery addresses (Home/Office), order history, and instant order tracking.
* **Email Confirmations**: Automated HTML order receipts sent via Resend.

### 2. Point of Sale (POS) & Billing
* **Multi-Branch Billing**: Instant offline walk-in billing and online order processing scoped per branch (**Branch 1** & **Branch 2**).
* **GST Invoicing**: Toggle between plain receipts and GST-compliant tax invoices with automatic CGST, SGST, and IGST breakdowns.
* **Discounts & Coupons**: Percentage-based and fixed-amount promotional discounts.
* **Printable Invoices & Receipts**: Thermal POS receipt and A4 tax invoice print templates.

### 3. Inventory & Multi-Branch Stock
* **Unified Catalog**: Single source of truth across customer storefront and offline POS inventory.
* **Multi-Branch Stock Tracking**: Real-time stock counts split across branches with low-stock warnings.
* **Inter-Branch Stock Transfers**: Formal workflow to request, approve, and transfer inventory between branches.
* **Variant & Finish Support**: Manage variations (e.g. Standard, Deluxe, Natural, Rosewood) with independent pricing, weights, and stock levels.

### 4. Instrument Repair & Service Ticketing
* **End-to-End Repair Lifecycle**: Track instrument service from `received` → `diagnosing` → `in-progress` → `awaiting-parts` → `ready` → `completed`.
* **Technician Assignment & SLA Tracking**: Assign service jobs to technicians with deadline calendars and automated overdue/due-soon alerts.
* **Advance Payments & Cost Estimation**: Record quotes, customer advance payments, final costs, and calculate balances due.
* **Audit Timeline**: Detailed changelog for status updates, diagnostics notes, and parts orders.
* **WhatsApp Notifications**: Instant customer updates for repair estimates, milestone completion, and pickup readiness.
* **Automated Service Invoicing**: Generates sequential `SER-YYYY-XXXXX` tax invoices upon ticket completion.

### 5. Vendor Management & Stock Inward
* **Vendor Directory**: Track supplier profiles, purchase history, and outstanding ledgers.
* **Stock Inward (GRN)**: Record incoming supplier shipments, update unit cost prices, and automatically increment branch stock levels.
* **Purchase Invoices**: Manage GST purchase bills with HSN rate breakdowns.

### 6. Admin, Analytics & Compliance
* **Live Dashboards & KPIs**: Revenue charts, sales breakdown by category/origin, top-selling instruments, and profit margins.
* **GST Reports**: Summarized taxable values, CGST, and SGST collections for easy GSTR-1 filing.
* **Delivery & Courier Tariff Matrix**: Professional Couriers tariff calculation (slab rates for Tamil Nadu, South India, and Rest of India based on parcel gram weight).
* **Role-Based Access Control (RBAC)**: Manage staff accounts (Admin, Manager, Cashier) with granular permissions for billing, inventory, analytics, and user administration.

---

## 🛠 Architecture & Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 16 (App Router)](https://nextjs.org/) |
| **Frontend UI** | [React 18](https://react.js.org/), [Tailwind CSS](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion), [Lucide React](https://lucide.dev/) |
| **State Management**| [Zustand](https://github.com/pmndrs/zustand) (Optimistic client state + server sync) |
| **Database & ORM** | [Neon Serverless PostgreSQL](https://neon.tech/) + [Drizzle ORM](https://orm.drizzle.team/) |
| **Authentication** | Google OAuth 2.0 with signed JOSE session cookies |
| **Payments** | [Razorpay API](https://razorpay.com/) (Checkout & Webhooks) |
| **Emails** | [Resend](https://resend.com/) |
| **Smooth Scrolling**| [Lenis](https://github.com/darkroomengineering/lenis) |

---

## 💰 Database & Money Handling

* **Integer Paise Storage**: All monetary fields (`price`, `mrp`, `cost`, `subtotal`, `gst`, `total`) are strictly stored in **paise** ($₹1 = 100\text{ paise}$) in the PostgreSQL database to completely eliminate floating-point arithmetic errors.
* **Gram Weight Storage**: Product base weights and variant total shipping weights are stored in integer **grams** ($1\text{ kg} = 1000\text{ grams}$).
* **Format Helpers**: Use `@/lib/utils` `formatINR()` and `formatKg()` for clean user-facing rupee and kilogram formatting.

---

## 🚀 Getting Started

### Prerequisites
* **Node.js**: `v18.18.0` or later (Node 20+ recommended)
* **npm**: `v9+`
* **Neon PostgreSQL Database**: Free tier database on [neon.tech](https://neon.tech)

---

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/<your-username>/sri-saraswathy-musicals.git
   cd sri-saraswathy-musicals
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file by copying `.env.example`:
   ```bash
   cp .env.example .env.local
   ```
   Fill in your configuration keys (see [Environment Variables](#-environment-variables)).

---

### Database Migration & Seeding

1. **Push the schema to your Neon database**:
   ```bash
   npm run db:push
   ```

2. **Seed demo catalog, categories, orders, and tickets**:
   ```bash
   npm run db:seed
   ```

3. **(Optional) Add real inventory batch**:
   ```bash
   npm run inventory:add
   ```

---

### Setting Up Admins

Admin access is controlled via the `is_admin` column in the `users` table. To grant admin rights to an email address:

```bash
npm run admin:set -- your-email@gmail.com
```

---

### Running Locally

Start the Next.js development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser:
* **Storefront**: `http://localhost:3000`
* **Admin Dashboard**: `http://localhost:3000/admin`
* **Service Ticketing**: `http://localhost:3000/admin/service`
* **POS Billing**: `http://localhost:3000/admin/billing`

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts local Next.js development server on port 3000 |
| `npm run build` | Builds optimized production bundle |
| `npm run start` | Runs built production server |
| `npm run lint` | Runs ESLint checks |
| `npm run db:generate`| Generates Drizzle migrations based on `src/lib/db/schema.ts` |
| `npm run db:migrate` | Runs pending Drizzle SQL migrations against the database |
| `npm run db:push` | Directly synchronizes Drizzle schema with Neon Postgres |
| `npm run db:studio` | Opens interactive Drizzle Studio database UI in the browser |
| `npm run db:seed` | Resets and populates the database with comprehensive demo data |
| `npm run inventory:add`| Additively inserts shop batch inventory without clearing the DB |
| `npm run admin:set` | Grants administrator privileges to a specified email address |

---

## 📂 Project Directory Structure

```
sri-saraswathy-musicals/
├── src/
│   ├── app/
│   │   ├── (shop)/               # Customer Storefront (Home, Products, Cart, Checkout, Profile)
│   │   ├── admin/                # Admin Portal (Billing, Inventory, Service, Analytics, Users, etc.)
│   │   ├── api/                  # Next.js Server Route Handlers (Auth, Orders, POS, Repair, Products)
│   │   ├── auth/                 # OAuth callback & login pages
│   │   ├── globals.css           # Global Tailwind CSS & custom design tokens
│   │   └── layout.tsx            # Root HTML layout with providers
│   ├── components/
│   │   ├── admin/                # Admin UI Modals (Product, Ticket, Customer, Invoice modals)
│   │   ├── home/                 # Storefront homepage sections (Hero, Featured, Categories, Testimonials)
│   │   ├── layout/               # Header, Footer, AdminSidebar, CartDrawer, MobileNav
│   │   ├── shop/                 # Storefront filters, product cards, gallery, specs
│   │   └── ui/                   # Shared UI atoms (Buttons, Badges, Inputs, Dialogs)
│   ├── lib/
│   │   ├── api/                  # API response helpers, auth gates, rate limiting
│   │   ├── auth/                 # Google OAuth, JWT session token signing & verification
│   │   ├── billing/              # Ledger calculations, GST tax math, invoice generators
│   │   ├── data/                 # Seed data fixtures (products, categories, users, invoices)
│   │   ├── db/                   # Drizzle client, connection pool, schema, seed & migration scripts
│   │   │   ├── queries/          # Modular database queries (orders, products, pos, repair, etc.)
│   │   │   ├── schema.ts         # PostgreSQL database schema definition
│   │   │   └── seed.ts           # Database seeding runner
│   │   ├── email/                # Resend email templates and transport
│   │   ├── payments/             # Razorpay order creation and signature verification
│   │   ├── stock.ts              # Decoupled branch stock calculations & synchronization helpers
│   │   ├── store/                # Zustand client state stores (auth, cart, pos, repair, staff, ui)
│   │   └── utils.ts              # String, slugify, INR currency, weight, and date formatters
│   └── types/                    # Shared TypeScript interfaces (Product, Cart, Order, Invoice, Ticket)
├── public/                       # Static public assets (logos, category images, instrument icons)
├── drizzle.config.ts             # Drizzle Kit configuration
├── next.config.ts                # Next.js configuration
├── package.json                  # Dependencies and scripts
├── tailwind.config.ts            # Custom design tokens, typography, and color palette
└── tsconfig.json                 # TypeScript compiler configuration
```

---

## 🔐 Environment Variables

Create a `.env.local` file with the following variables:

```ini
# Neon PostgreSQL Database (Use the pooled connection string with ?sslmode=require)
DATABASE_URL="postgresql://user:password@ep-xyz-pooler.region.aws.neon.tech/neondb?sslmode=require"

# Application Public Origin
APP_URL="http://localhost:3000"

# Authentication (Google OAuth & Session Secret)
AUTH_SECRET="generate-with-openssl-rand-base64-32"
GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"

# Razorpay (Online Storefront Checkout)
RAZORPAY_KEY_ID="rzp_test_xxxxxx"
RAZORPAY_KEY_SECRET="your-razorpay-secret"
NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_xxxxxx"

# Resend (Order Confirmation Emails)
RESEND_API_KEY="re_xxxxxx"
ORDER_FROM_EMAIL="Sri Saraswathy Musicals <onboarding@resend.dev>"
```

---

## 📄 License

Private and proprietary. Developed for **Sri Saraswathy Musicals**. All rights reserved.
