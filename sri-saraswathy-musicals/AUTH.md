# Auth, Payments & Email

This app uses **Google OAuth** for sign-in (no passwords), **Razorpay** for
storefront payments, and **Resend** for customer order emails. All three are
wired in code — you only need to drop credentials into `.env.local`. Until you
do, the app still runs and degrades gracefully (see the table at the end).

`.env.local` already has an `AUTH_SECRET` generated for you. Fill in the empty
values below. Admin access is granted in the database, not here (see §2).

---

## 1. Sign-in — Google OAuth

Login is **Google-only**. Clicking "Continue with Google" hits
`/api/auth/google`, which redirects to Google; Google returns to
`/api/auth/callback/google`, where we look the user up (or create them) in the
`users` table and set a signed, httpOnly **session cookie**. No auth vendor, no
per-user cost, no monthly-active-user cap.

### Set it up

1. Go to <https://console.cloud.google.com/apis/credentials> (create a project
   if you don't have one).
2. Configure the **OAuth consent screen** (External). Add yourself under
   *Test users* while it's unverified.
3. **Create credentials → OAuth client ID → Web application.**
4. Under **Authorized redirect URIs**, add exactly:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
   (and your production URL, e.g. `https://yourdomain.com/api/auth/callback/google`).
5. Copy the **Client ID** and **Client secret** into `.env.local`:
   ```
   GOOGLE_CLIENT_ID="…"
   GOOGLE_CLIENT_SECRET="…"
   ```
6. Set `APP_URL` to your origin (`http://localhost:3000` for dev). The redirect
   URI is derived from it, so it must match what you registered in step 4.

> While the Google app is "unverified", Google shows a warning screen on first
> sign-in. Add yourself as a test user (step 2) to skip it, or submit for
> verification later. This is a Google thing, not specific to this app.

---

## 2. Who can access `/admin` — the `isAdmin` column

The `users` table has an authoritative **`is_admin`** boolean.
`/admin/*` (and the "Admin panel" link) are gated on it; everyone else who signs
in is a normal **customer**. Admin status is **set in the database only** —
there is no env allowlist. Sign-in never changes the flag; it just reads it.

Grant / revoke admin (works even before the person's first sign-in — a
placeholder row is created and linked to their Google account on first login):

```bash
npm run admin:set -- someone@gmail.com            # grant admin
npm run admin:set -- someone@gmail.com --revoke   # revoke admin
```

You can equally toggle `is_admin` by hand in **Drizzle Studio** (`npm run db:studio`).

The flag is baked into the session cookie at sign-in, so gating needs no
database call. **If you change someone's admin status, they must sign out and
back in** for it to take effect.

The route gate lives in [`src/proxy.ts`](src/proxy.ts) (Next.js 16's renamed
middleware): `/checkout` and `/profile` require any signed-in user; `/admin/*`
requires `is_admin`.

---

## 3. Payments — Razorpay (storefront only)

Razorpay powers the **customer checkout** only. Admin billing/POS is untouched.

Flow: the storefront calls `/api/checkout/create`, which **prices the cart on
the server** (never trusting the browser) and creates a Razorpay order; the
browser opens Razorpay's hosted checkout; on success `/api/checkout/verify`
**verifies the payment signature** before the order is saved. "Pay on delivery"
skips Razorpay and saves the order directly.

### Set it up

1. Sign up at <https://dashboard.razorpay.com>.
2. **Settings → API Keys → Generate Test Key** (use `rzp_test_…` for dev).
3. Put them in `.env.local`:
   ```
   RAZORPAY_KEY_ID="rzp_test_…"
   RAZORPAY_KEY_SECRET="…"
   NEXT_PUBLIC_RAZORPAY_KEY_ID="rzp_test_…"   # same as RAZORPAY_KEY_ID
   ```
   `NEXT_PUBLIC_RAZORPAY_KEY_ID` is exposed to the browser — that's expected and
   safe (it's the publishable key id; the secret stays server-side).
4. Test card: `4111 1111 1111 1111`, any future expiry, any CVV, any OTP.

If Razorpay isn't configured, online payment returns a friendly error and the
customer can still use **Pay on delivery**.

---

## 4. Email — Resend (customer order confirmations)

After a successful order (COD or Razorpay), the customer gets a confirmation
email. Admin/billing sends no email. Failures never block an order.

### Set it up

1. Sign up at <https://resend.com> and create an API key at
   <https://resend.com/api-keys>.
2. Put it in `.env.local`:
   ```
   RESEND_API_KEY="re_…"
   ORDER_FROM_EMAIL="Sri Saraswathy Musicals <orders@yourdomain.com>"
   ```
3. For real sending, **verify your domain** in Resend and use an address at that
   domain in `ORDER_FROM_EMAIL`. For quick testing, Resend's
   `onboarding@resend.dev` sender works (delivers to your own account email).

---

## Behaviour when a credential is missing

| Missing            | Effect                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| `AUTH_SECRET`      | Dev: an insecure fallback is used (a warning-worthy default). Prod: sign-in throws — **always set it in production.** |
| `GOOGLE_CLIENT_*`  | Login shows "Google sign-in isn't set up yet." Nothing else breaks.    |
| `RAZORPAY_*`       | Online payment shows a friendly error; Pay-on-delivery still works.    |
| `RESEND_API_KEY`   | Orders still place; no confirmation email is sent.                     |

---

## Files added / changed

- `src/lib/auth/` — session (jose), Google OAuth, config, server helpers
- `src/proxy.ts` — route gate for `/checkout`, `/profile`, `/admin`
- `src/app/api/auth/*` — `google`, `callback/google`, `session`, `logout`
- `src/app/api/checkout/{create,verify}` — Razorpay-backed order placement
- `src/app/api/orders/mine` — the signed-in customer's own orders
- `src/lib/checkout/{pricing,draft}` · `src/lib/payments/razorpay` · `src/lib/email/resend`
- `users.is_admin` / `users.google_id` / `users.avatar` and order↔user columns
  (migration `drizzle/0001_grey_slayback.sql`, already applied)
