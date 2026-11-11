# Sri Saraswathy Musicals — What changed, and how to check it

This document covers every change made in phases 1 to 6, in plain language. For each part it says **what changed**, **where to find it** (screen and code), and **how to check it**.

Notes for the tester:
- Money is shown in rupees on screen. In the database it is stored in paise (₹1 = 100 paise).
- Branch names are Vadapalani, Porur and Ashok Nagar. Inside the database they are still stored as `Branch 1`, `Branch 2` and `Branch 3`.
- Nothing here is in production, so you can create test data freely. Delete it afterwards, or tell the developer.
- Before testing, make sure the app runs: `npm run dev`, then open the admin at `/admin`.

---

## Quick map of the screens

| Area | Admin menu | Address |
|---|---|---|
| Sales | Billing | `/admin/billing` |
| Sales | Orders | `/admin/orders` |
| Sales | Invoices | `/admin/invoices` |
| Sales | Quotations | `/admin/quotations` |
| Sales | Service / Repairs | `/admin/service` |
| Inventory | Inventory, Categories, Stock Transfers | `/admin/inventory`, `/admin/categories`, `/admin/stock-transfers` |
| Procurement | Purchases | `/admin/purchases` |
| Procurement | Purchase Invoices | `/admin/purchases/invoices` |
| Procurement | Vendors | `/admin/vendors` |
| Procurement | Vendor Outstandings | `/admin/vendors/outstandings` |
| Reports | Sales Analytics | `/admin/analytics` |
| Reports | Purchase Analytics | `/admin/analytics/purchases` |
| Reports | GST & Tax | `/admin/gst` |
| Setup | Branches, Users | `/admin/branches`, `/admin/users` |

---

# Phase 1 — Branch 3, branch access, WebP images, variants and stock tables

### 1.1 Branch 3 (Ashok Nagar)
- **What:** a third branch was added, and branches are now defined in one place instead of being hard-coded as two.
- **Where in the code:** `src/lib/data/business.ts` (the single branch list), `src/lib/stock.ts` (helpers such as `branchLabel`), `src/lib/db/vocab.ts` (database checks are built from the same list).
- **How to check:**
  1. Open the branch picker at the top of the admin. It should list All Branches, Vadapalani, Porur and Ashok Nagar.
  2. Open Inventory → Add Product. The stock boxes should show three branches.
  3. Open `/admin/branches`. Three branches should be listed, each with an editable code and details.

### 1.2 Branch names instead of "Branch 1/2/3"
- **What:** everywhere a person sees a branch, it shows the name (Vadapalani, Porur, Ashok Nagar), never "Branch 1".
- **How to check:** walk through Invoices, Purchases, Vendor Outstandings, Service tickets and Stock Transfers, and confirm you never see "Branch 1", "Branch 2" or "Branch 3" written out.

### 1.3 Branch can be chosen on an Inquiry
- **What:** the inquiry form (storefront and admin) lets you pick which branch the inquiry is for, including Ashok Nagar.
- **Where:** `/admin/inquiries` and the storefront inquiry page.
- **How to check:** create an inquiry, pick Ashok Nagar, and confirm it appears in the admin list with that branch.

### 1.4 Branch access can be given to users
- **What:** an admin can decide which branches each staff user can work in (one, two or all). Staff only see and change data for their own branches.
- **Where:** `/admin/users`; the rules live in `src/lib/auth/` and in each API route's access check.
- **How to check:**
  1. Create or edit a user and give them only Porur.
  2. Log in as that user, and confirm that Invoices, Purchases, Vendor Outstandings and Service tickets show only Porur data.
  3. Confirm they cannot pick another branch when creating something.

### 1.5 Images are converted to WebP
- **What:** photos uploaded in the admin are shrunk and converted to WebP in the browser before saving, so they are a few KB.
- **Where:** `src/lib/client/image.ts`, used by Edit Product.
- **How to check:** upload a large JPG as a product photo. The saved photo should load fast, and the file should be small.

### 1.6 Variants and stock moved into real tables
- **What:** product variants and per-branch stock used to live inside a JSON field. They are now proper tables (`product_variants`, `variant_stock`), and stock changes are atomic so two sales can't overwrite each other, and stock can never go below zero.
- **Where:** `src/lib/db/queries/variants.ts`, `src/lib/db/queries/stockOps.ts`.
- **How to check:**
  1. Sell more units than you have, either in Billing or by raising a service product. You should get an "only N in stock" message, not a negative number.
  2. Try deleting a variant that still has stock. You should be told to zero its stock first.

### 1.7 Database tidy-ups
- Invoice numbers must be unique, and user emails must be unique (ignoring upper/lower case).
- Vendors no longer store a made-up "outstanding" figure. Outstandings are always worked out from bills and payments.

---

# Phase 2 — Invoices

### 2.1 Branch name above the GST number
- **What:** the invoice header shows the branch names above the GSTIN.
- **Where:** `src/components/invoice/TaxInvoiceSheet.tsx`.
- **How to check:** open any invoice at `/admin/invoices/<id>`. The branch name appears above the GST number.

### 2.2 "Subject to 'Chennai' jurisdiction only."
- **What:** this line is printed in the terms and conditions of every invoice.
- **How to check:** open an invoice and read the terms section at the bottom.

### 2.3 Branch-wise invoice reference
- **What:** every invoice gets a customer-facing reference that runs per branch and per year, such as `INV-2026-P0001`, `INV-2026-P0002`. Each branch has its own sequence.
- **Codes:** Vadapalani `V`, Porur `P`, Ashok Nagar `A`. These can be changed on the Branches page.
- **Digits:** 4 digits (so it allows up to 9,999 invoices per branch per year). References issued earlier keep their older 3-digit numbers (`INV-2026-V014`) and Porur's earlier `1MH` numbers.
- **Where:** `src/lib/db/queries/invoices.ts` (`nextBranchReference`), counters table.
- **How to check:**
  1. Create two sales at Porur. They should be `…-P0001` and `…-P0002` (or the next free numbers).
  2. Create one at Vadapalani. It should continue Vadapalani's own count, not Porur's.

### 2.4 The tax invoice number is unchanged
- **What:** the GST tax number (`SSM/2026-27/0008`) still runs in one sequence across all branches.
- **How to check:** create invoices at two different branches, and confirm the `SSM/…` numbers go up one after another across both.

### 2.5 GST is editable
- **What:** GST is no longer fixed. You can change the rate on the invoice editor and on service tickets.
- **Where:** `/admin/invoices/<id>` (invoice editor), service ticket page.
- **How to check:** change a line's GST rate in the invoice editor, save, and confirm the totals and tax split change.

### 2.6 GSTR-1 uses the Vadapalani address
- **What:** the GST report uses the Vadapalani branch address as the business address.
- **Where:** `/admin/gst`, `src/components/gst/GstReportSheet.tsx`.
- **How to check:** open the GST report and check the address at the top.

---

# Phase 3 — Quotations

### 3.1 New Quotations tab
- **What:** a quotation page replaces the old "estimate" format. A quotation can be created, edited, printed, copied as a link, or sent on WhatsApp.
- **Numbering:** per branch and year, for example `QT-2026-P0001`.
- **Terms printed on it:** valid for 30 days from issue, prices may change after that, and an advance payment is needed to start work or order processing.
- **Advance field:** a quotation can carry an advance amount.
- **Public link:** a customer can open `/quotation/<random id>`. The id is random, so people can't guess other customers' quotations.
- **Where:** `/admin/quotations`, `src/lib/quotation.ts`, `src/lib/db/queries/quotations.ts`, `src/components/quotation/*`.
- **How to check:**
  1. Go to Sales → Quotations → New. Add items with GST, an advance, and customer details.
  2. Save. The number should be `QT-<year>-<branch code>NNNN`.
  3. Open the quotation, click **Copy link**, and open it in a private window. It should show the printable sheet without logging in.
  4. Check the terms (30 days, price change, advance) are on the sheet.
  5. Click **Print** and **WhatsApp** and confirm both work.
  6. Confirm that totals match: the server recalculates them, so editing the numbers in the browser can't change them.

### 3.2 Removed items
- The status counters, filters and labels on the quotation page were removed on request.
- The "Quotation" button on the service ticket was removed.
- **How to check:** the Quotations page shows only the list and the New button, with no "open / accepted / declined" counters.

### 3.3 Still waiting
- The sample quotation file you mentioned has not been supplied. The layout was built without it and can be adjusted when it arrives.

---

# Phase 4 — Purchases

### 4.1 GST on purchases (with a "Prices include GST" checkbox)
- **What:** each purchase line has a GST % dropdown (the same one as sales), set from the product's own rate. The tax is worked out automatically as CGST + SGST, or IGST when "Inter-state purchase" is ticked. You can still type over the tax figures, and "Reset to calculated" restores them.
- **"Prices include GST":** ticked by default. When ticked, the cost you type includes GST, and the tax is taken out of it (₹1,180 at 18% becomes goods ₹1,000 + GST ₹180). When unticked, the cost is before GST and tax is added on top. The cost is always stored before GST.
- **Where:** `/admin/purchases`; maths in `src/lib/gst/purchaseTax.ts`.
- **How to check:**
  1. Add a line: quantity 10, cost ₹1,180, GST 18%, with "Prices include GST" ticked. Goods subtotal should be ₹10,000, GST ₹1,800, grand total ₹11,800.
  2. Untick "Prices include GST". The cost should change to ₹1,000 (before GST), and the grand total should stay ₹11,800. Tick it again and the cost goes back to ₹1,180.
  3. Tick "Inter-state". The GST should move into IGST.
  4. Type a different GST amount, and confirm the total changes. Click "Reset to calculated" to undo.

### 4.2 Partial payment goes to the branch(es) you choose
- **What:** "Amount Paid Now" has a "Which branch pays it" section, with one ₹ box per branch that receives stock. Change one box and the other adjusts, so the total always matches. It is not split equally.
- **Where:** `src/components/purchases/PaymentSplit.tsx`, `src/lib/paymentAlloc.ts`.
- **How to check:**
  1. Buy 9 units: 6 to Vadapalani, 3 to Porur. Enter an amount paid of ₹6,000.
  2. Put ₹6,000 on Vadapalani and ₹0 on Porur. Save.
  3. In Purchase Invoices, expand the bill. It should say "Paid at purchase ₹6,000 · Vadapalani ₹6,000".

### 4.3 Purchase Invoices page (new tab)
- **What:** all vendor bills in one list, in their own tab (Recent purchases is no longer mixed into the Purchases page). It has From/To date filters, a Branch filter, search, CSV export and a totals line (billed, paid, balance).
- **Where:** `/admin/purchases/invoices`.
- **How to check:** filter by date and branch and confirm the list and the totals line both change. Export the CSV and check the figures match.

### 4.4 Purchase invoices are editable (admin only)
- **What:** **Edit** on a bill lets an admin change the vendor invoice number, date, each line's cost and GST %, the CGST/SGST/IGST amounts, the amount paid and who paid it, the payment mode and notes. It has a "Prices include GST" checkbox (ticked by default). Quantities and products are locked, because stock has already moved. Use a stock adjustment to correct those.
- **How to check:** edit a bill's unit cost. The GST and totals should recalculate. Try making "paid" larger than the total, and confirm it is refused.

### 4.5 "Update selling price" checkbox
- **What:** the checkbox is kept on the purchase line, and the long explanation next to it was removed.
- **How to check:** the checkbox is there with only a short label.

### 4.6 Date and branch filters on the sales invoices
- **What:** Sales → Invoices has From/To dates and a Branch filter, and the stats follow the filters.
- **How to check:** filter by Porur. The invoice count and totals should be only Porur's. Porur + Vadapalani + Ashok Nagar should add up to the overall total.

### 4.7 Dropped on purpose
- "Add Product inside Purchase" was not built, because admins can already add a product from Inventory.

### 4.8 Tooling changes
- `npm run lint` works again (the old `next lint` was removed in Next 16). The config is `eslint.config.mjs`.
- `/admin` now redirects to `/admin/billing` from `next.config.mjs`.

---

# Phase 5 — Vendor payments and opening balances

### 5.1 Every vendor payment is against an invoice
- **What:** you can no longer record a payment to "the vendor in general". Each payment names a bill. This keeps each invoice's paid and balance figures matching the vendor's total.
- **Where:** the vendor panel on `/admin/vendors/outstandings` (click **View** on a vendor). The server refuses a payment with no bill (`/api/vendor-payments`).
- **How to check:** open a vendor's panel. You see "Unpaid bills", each with its own **Pay** button, and no "on-account payment" box.

### 5.2 Pay a bill (the Pay dialog)
- **What:** the dialog shows what is owed on the bill and "Which branch pays it", one box per branch that received that bill's stock. It starts from what each branch still owes, so a branch that already paid its part isn't charged again.
- **How to check:** on a bill where Vadapalani paid its part up front, open Pay. Vadapalani should start at ₹0 and Porur should carry the balance.

### 5.3 Pay vendor (one amount over many bills)
- **What:** a gold **Pay vendor** button in the vendor panel. You enter one amount and it pays the oldest unpaid bills first. A table shows which bill gets how much and which branch pays, **before** you save. "Who pays" can be each branch's own share, or only one branch.
- **How to check:**
  1. Give a vendor two unpaid bills (see 5.4): Porur ₹4,000 dated March, Vadapalani ₹6,000 dated April.
  2. Click **Pay vendor** and type ₹7,000. The table should show Porur ₹4,000 on the March bill (left ₹0) and Vadapalani ₹3,000 on the April bill (left ₹3,000).
  3. Save. The panel should show ₹3,000 outstanding, and the ledger should show two payments with their branches.
  4. Type more than is owed. You should be told how much is owed.

### 5.4 Opening balance for a vendor (admin only)
- **What:** records what was already owed to a vendor before using this system, per branch, with an "as of" date. It behaves like a bill: it shows in outstandings and the statement, it can be paid, edited, or removed (only while nothing has been paid on it).
- **Where:** vendor panel → **+ Opening balance**, or the **Opening balance** button on Purchase Invoices.
- **How to check:**
  1. Add ₹10,000 owed by Porur.
  2. Check the vendor's outstanding shows ₹10,000 for Porur, and the Purchase Invoices page shows an "Opening balance" row.
  3. Pay ₹4,000. Only Porur should be offered as the payer. The balance should become ₹6,000.
  4. Try to edit the amount to less than what is paid. It should be refused.
  5. A second opening balance for the same vendor and branch should be refused.

### 5.5 Older payments with no bill
- **What:** payments made before this rule appear in a gold box, "Payments not against a bill", with an **Apply to bills** button (admin only). The dialog proposes the oldest bills first. Whatever is not used stays as an unassigned payment.
- **How to check:** apply a payment to two bills and confirm the branch outstandings don't change but the bills' balances do.

### 5.6 Opening stock for a product
- **What:** when adding a product, the per-branch stock boxes can be filled in. This is the stock you already hold. It does not create a vendor bill. Later stock is bought through Purchases.
- **How to check:** Add Product, enter 5 at Vadapalani and 3 at Porur, save. Inventory should show those figures, and no purchase should appear in Purchase Invoices.

### 5.7 Help text
- Vendor Outstandings has a collapsible **How this works** box explaining all of the above.

---

# Phase 6 — Variants, reports and service products

### 6.1 Variant dropdowns show stock
- **Purchases form:** the variant dropdown reads like "Std · Natural — Vadapalani 5 · Porur 3 · Ashok Nagar 0".
- **Stock Transfers:** it shows how many the source branch has.
- **Storefront product page:** the option picker is a dropdown showing "19 in stock", "Only 2 left" or "Sold out". Sold-out options can't be picked.
- **How to check:** open each place and confirm the numbers match Inventory.

### 6.2 A separate photo for each variant
- **What:** in Edit Product, the variants table has a **Photo** column. Click the box to upload, and the × removes it. On the storefront, choosing a variant that has its own photo shows that photo first in the gallery.
- **How to check:** give two variants different photos, open the product page, switch variants, and confirm the main photo changes. (A bug where the picture did not change was fixed in `src/components/ui/ProductImage.tsx`; this was not seen on screen, so please check it.)

### 6.3 Net sales in analytics
- **What:** the revenue cards are called **Net Sales** (after discounts, before GST, before delivery). A line under them shows the working: billed total − delivery − GST = Net Sales.
- **Where:** `/admin/analytics`.
- **How to check:** the three numbers in the line should add up exactly to the Net Sales figure.

### 6.4 Sales report includes customer details
- **What:** the Sales Report tab already lists customer name, phone and GSTIN for each bill, and the CSV export includes them.
- **How to check:** open the Sales Report tab, search by a phone number, and export the CSV.

### 6.5 Advance paid counts as revenue
- **What:** an advance paid on a repair that is not finished counts as revenue on the day it was received, as its own "Advance" entry. Once the repair is ready or completed, the full charge replaces it, so nothing is counted twice. Cancelled repairs don't count.
- **How to check:** create a repair ticket with a ₹2,000 advance. In Analytics, "Service Net Sales" should include it. Mark the ticket Ready and check the total does not double.

### 6.6 Products bought during a service appear on the invoice
- **What:** a service ticket page has a new section, **Products sold with this service**. Search your inventory (or add an "Other item"), set quantity, price (GST-inclusive) and GST, and save. The products appear as their own lines under the service charge on the same tax invoice, each with its own GST, and the ticket total and balance include them. Products from inventory come out of that branch's stock, and removing one puts the stock back. If the branch has too few, it is refused with a clear message.
- **Assumption to confirm with the client:** the service charge stays as entered and the products are added on top. If the client wants the products taken out of the service charge instead, that is a small change.
- **How to check:**
  1. Open a completed ticket and add a product with stock. Save.
  2. Open **View Invoice**: there should be two lines, the total should be service + product, and "Balance due" should include the product if the advance is less than the total.
  3. Check the product's stock went down by the quantity at the ticket's branch.
  4. Remove the product and save. The invoice returns to one line and the stock goes back.
  5. Add more than is in stock. You should get "only N in stock at …" and nothing should change.

---

# Phase 7 — Requirements document of 1 Nov 2026 (first batch)

IDs below match the client's *Detailed Requirements* document. Migrations **0037** and **0038** must be applied (`npm run db:migrate`); both only add columns and one table.

### 7.1 Print, PDF and WhatsApp for every document (BIL-05, BIL-06, BIL-07, LED-01, QUO-01, QUO-04, REP-05)
- **What:** one toolbar on every invoice, quotation and repair document: **Print ▾** (choose *Thermal receipt 80 mm*, *Thermal receipt 58 mm* or *A4 sheet*), **Download PDF** (a real A4 PDF file, ~250 KB) and **WhatsApp** (message with the items, the GST split and the share link). The thermal receipt is plain black text in Arial and is sized to the roll width and the receipt's own height, so the printer cuts right after it. A Bluetooth printer works through the phone's or PC's normal print dialog (pick the printer there).
- **Where:** admin invoice (`/admin/invoices/[id]`), public invoice link (`/invoice/[id]`), admin quotation (`/admin/quotations/[id]`), public quotation link (`/quotation/[id]`), repair invoice / receipt (`/admin/service/[id]/invoice`). The ledger (`/admin/invoices`) and quotation list (`/admin/quotations`) have a **⋯** menu on each row with the same five actions.
- **Code:** `src/components/print/OutputActions.tsx`, `ThermalReceipt.tsx`, `RowOutputMenu.tsx`, `src/lib/print/doc.ts`.
- **How to check:**
  1. Open any invoice → **Print ▾ → Thermal receipt · 80 mm**. In the print preview the page should be 80 mm wide and only the receipt should appear. Repeat for 58 mm and A4.
  2. **Download PDF** → the file opens and is named like `Invoice-SSM_2026-27_0004.pdf`.
  3. **WhatsApp** → WhatsApp opens to the customer's number with the bill text and link.
  4. In the ledger, use the **⋯** on a row → *Print thermal · 80 mm*. The invoice opens in a new tab and the print dialog appears by itself.

### 7.2 Billing: generate, then choose the output (BIL-05/06/07)
- **What:** the billing panel's buttons are now one **Generate Bill** button. After saving, a box asks how the customer wants it: **Thermal 80 mm**, **Thermal 58 mm** or **A4**, **WhatsApp** (message with emojis), **Download PDF**, and a **Done · New bill** button. Print and PDF happen right on the billing page; no new tab opens. *View invoice* opens the invoice page if needed.
- **Layout:**
  - Customer detail labels stay on one line, so the mobile field no longer drops lower than the others.
  - Each item card shows its fields as 3 on top (HSN, GST, MRP) and 3 below (Price, Qty, Discount), so long MRPs aren't cut off.
  - The summary panel on the right is wider.
- **Thermal page size:** the receipt now prints on an 80 mm (or 58 mm) page sized to the receipt's height. Before, it printed in the middle of an A4 page because the A4 sheet's page rule won.
- **Speed:** invoice and quotation pages no longer show the 1.8-second shop splash animation.
- **Where:** `/admin/billing` · `src/app/admin/billing/page.tsx`, `src/components/print/BillOutputPanel.tsx`, `src/components/print/OutputActions.tsx` (`printIsolated`), `src/components/Splash.tsx`, `src/app/api/invoices/by-ref/[ref]/route.ts`.
- **How to check:** make a bill and press *Generate Bill*.
  1. Click *Thermal 80 mm*: the print preview page should be narrow (80 mm), not A4.
  2. Click *A4*: you should get an A4 invoice.
  3. Click *Download PDF*: you should get a file of about 250 KB.
  4. Click *WhatsApp*: the message should have emojis.
  5. Click *Done · New bill*: the form should clear.

### 7.2a Faster billing, catalog quantity buttons, WhatsApp emojis
- **Generate Bill is faster:**
  - The "Bill generated" box opens straight away and shows "Saving…" while the bill saves. WhatsApp works at once; the print buttons turn on when the save finishes.
  - The save makes fewer database round-trips (stock for all lines at once; GST number, reference and customer lookup together), and the invoice comes back with it, so there is no second request.
  - The catalogue is no longer downloaded again after every bill; stock is reduced on screen instead.
- **Catalogue loads in about 2 s instead of 10–40 s:**
  - The billing / purchases list no longer pulls every product and variant photo out of the database: 40 KB instead of about 3 MB.
  - Each thumbnail loads on its own from `/api/pos/inventory/<id>/photo` and the browser caches it.
  - The product editor still loads a product's full photos.
- **Catalog quantity:**
  - After **+** on a product, the button becomes **− qty +**. At quantity 1 the **−** is a bin, which takes it off the bill.
  - Products with variants work the same way: open the variant list and each variant gets its own **− qty +** once added.
  - **+** stops at the stock on hand.
- **WhatsApp:**
  - Every WhatsApp button now opens `https://api.whatsapp.com/send/?phone=…&text=…`, not `wa.me`, whose redirect turned emojis into "?" boxes.
  - Emojis are built with `String.fromCodePoint` from a safe list with no U+FE0F variation selectors, and the message is URL-encoded once. Code: `src/lib/whatsapp.ts`.
- **How to check:**
  1. Generate a bill. The box appears immediately and print turns on within a second or two.
  2. In the catalog, add a product, press + and − a few times, and confirm the bill's quantity follows.
  3. Send on WhatsApp and confirm the emojis show properly.

### 7.3 GST split-up with rates (BIL-01, QUO-02)
- **What:** invoices, quotations, thermal receipts, the billing summary, WhatsApp text and the edit-bill screen show **CGST @ 9%**, **SGST @ 9%** (half the GST rate) and **Total GST**. When a bill has items at different GST rates, the A4 invoice adds a small rate-wise table (rate, taxable value, CGST, SGST, total tax). IGST is shown as **IGST @ 18%** when present. *(Whether inter-state IGST billing is needed is still an open point.)*
- **Code:** `gstSummary` / `taxLabel` in `src/lib/print/doc.ts`; `src/components/invoice/TaxInvoiceSheet.tsx`; `src/components/quotation/QuotationSheet.tsx`.
- **How to check:** open a bill with one 18% item → "CGST @ 9%". Open one with 18% and 12% items → plain "CGST" plus the rate table, whose columns add up to the totals.

### 7.4 Edit bill fixes (BIL-02)
- **What:** on *Edit invoice*: Rate, MRP, Discount, Bill discount and Delivery no longer jump while typing (you can type `12.50` or clear the box). Quantity can be cleared and retyped. Each line has a **product search**: picking a product fills the name, HSN, GST % and price, and the totals and GST split recalculate. Removing a line no longer shifts the next line's inputs. The GSTIN is checked, and empty lines are refused on save.
- **Where:** `/admin/invoices/[id]` → Edit · `src/app/admin/invoices/[id]/InvoiceEditor.tsx`.
- **How to check:** edit a bill, change a product with the search, change quantity and rate, remove a line, and confirm the totals at the bottom match.

### 7.5 Customer auto-fill (BIL-04)
- **What:** typing a full 10-digit mobile number on the billing panel looks the customer up by itself, with no button needed. The name and GST number fill in. A new number shows "New customer", and the customer record is created when the bill is saved, as before.
- **How to check:** type a known customer's number and wait half a second.

### 7.6 GST number check (QUO-03 and billing)
- **What:** the GSTIN must be 15 characters in the right pattern (e.g. `33ABCDE1234F1Z5`) on quotations, billing and edit-bill. A wrong one shows a red message and is refused. The server checks quotations too.
- **Code:** `src/lib/gst/gstin.ts`.

### 7.7 Cancelled bills (LED-02, LED-03, LED-04, LED-05, ANA-03)
- **What:** a cancelled bill stays in the ledger marked *Cancelled*. It is left out of *Total billed* and out of all analytics. Its stock goes back to the branch, and every stock return is written to a new **Stock log**. The ledger has a **Paid / Pending / Cancelled** filter next to the date range.
- **Where:** `/admin/invoices`; **Inventory → Stock log** button (`src/components/admin/StockLogModal.tsx`, table `stock_movements`, API `/api/stock-movements`).
- **How to check:** cancel a counter bill and confirm (a) it still shows as Cancelled, (b) *Total billed* dropped, (c) Inventory → *Stock log* shows "Bill cancelled +N" for each item, (d) Analytics totals dropped.

### 7.8 Repair payments (REP-01, REP-02, REP-03, REP-04)
- **What:**
  - **Raise Repair Ticket** has **Paid now** and **Payment mode** (Cash, GPay/UPI, Card, Bank, Other).
  - The ticket page has a **Payments** panel. Record a payment (amount, mode, note) and it appears in the history at once with its own receipt number (`REP-…/R2`). *Amount paid*, *Balance due* and the *Part paid / Fully paid* badge update immediately; this fixes the "not updating" problem. *Receive full balance* settles the rest.
  - While a balance is due, the document is a **Payment Receipt** marked *not a tax invoice*, not a tax invoice. The GST tax invoice number is only taken once the ticket is fully paid.
  - In analytics and sales, a part-payment shows as "Part payment" with its payment mode, never as an "Advance". This replaces 6.5's "Advance" label.
- **Where:** `/admin/service` (new ticket), `/admin/service/[id]` (Payments), `/admin/service/[id]/invoice` and the customer link `/invoice/<ticket id>` (receipt or invoice).
- **Code:** `src/lib/billing/repairPayments.ts`, `src/lib/billing/repairReceipt.ts`, `src/components/print/ReceiptSheet.tsx`, `src/app/api/repair/route.ts`, `src/app/api/repair/[id]/route.ts`, `src/lib/billing/ledger.ts` (`recordServiceInvoice`).
- **How to check:**
  1. Raise a ticket with ₹500 paid by UPI.
  2. Open it: one payment, *Part paid*.
  3. Add ₹300 cash: the history shows two payments and the balance drops at once.
  4. Open the receipt: it says *Payment Receipt — not a tax invoice*.
  5. Receive the full balance: the badge turns *Fully paid*, and *Open Invoice* now shows the GST tax invoice with a new SSM number.
- **Older tickets:** a ticket from before this change shows its advance as one payment "Paid at intake".

### 7.9 Repair report dates (REP-06)
- **What:** Service → Report has *All time / Today / This week / This month* and From–To dates.

### 7.10 Analytics (ANA-01, ANA-02, ANA-04, ANA-05)
- **What:**
  - **Payment Mode Split** card: Cash / UPI / Card / Online / Other. With linked expenses, each mode shows "− expenses = net".
  - **Export to Excel** button: a real `.xlsx` with sheets Summary, Payment modes, Branches, Bills, Top items and Deductions, all following the period, branch, channel and tax filters.
  - **Net Sales after Expenses** and **Linked Deductions** cards.
  - **GST Collected** shows the CGST and SGST split.
  - **Branch Comparison** card.
- **Where:** `/admin/analytics` · `src/app/admin/analytics/page.tsx`, `src/lib/reports/excel.ts`, `/api/analytics/deductions`.
- **The layout is a proposal (ANA-05):** confirm the cards with the client.

### 7.11 Expenses and vendor bills linked to analytics (EXP-01, EXP-02, EXP-03, EXP-04)
- **What:**
  - Each expense has **Subtract in analytics**: a checkbox when adding, and a *Linked / Off* switch in the list. Each vendor bill has a **Subtract in analytics** button in its detail panel (Purchase Invoices). Payments on a linked bill, at purchase and later, are deducted with their own payment mode.
  - **Categories & analytics** (admin) lets you add, rename (moves every expense filed under the old name) and enable or disable expense categories, and choose which payment modes the deduction applies to.
  - Expenses can now be **edited** (pencil icon). The list scrolls sideways on phones and shows payment modes as "GPay / UPI", "Card" and so on.
- **Where:** `/admin/expenses`, `/admin/purchases/invoices`.
- **Code:** `src/components/expenses/ExpenseCategoriesModal.tsx`, `ExpenseEditModal.tsx`, `src/app/api/expenses/[id]/route.ts` (PATCH), `src/app/api/expenses/categories/route.ts`, `src/components/purchases/BillDetailPanel.tsx`.
- **How to check:** add a ₹1,000 cash expense with *Subtract in analytics* ticked. Analytics → *Linked Deductions* ₹1,000, *Net Sales after Expenses* drops by ₹1,000, and the Cash row shows "− ₹1,000". Untick Cash under *Categories & analytics* and the deduction disappears.

### 7.12 Other items from the in-progress batch
- **ADM-04 / INV-07:** Inventory → **Low-stock alerts: On/Off**. When Off, nothing is highlighted as low (out-of-stock still shows).
- **INV-03:** variant stock boxes in Add Product start empty instead of "0".
- **INV-05 / INV-06:** Stock Transfers has date, from-branch and to-branch filters, a search box (product, variant, who), and a **By** column showing who made each transfer.
- **INQ-01:** Inquiries has a date-range filter, alongside the existing branch, status and search filters.

---

# Cross-checks for the whole system

1. **Totals agree.** For one vendor: outstanding = purchased − paid, per branch, and the branch figures add up to the vendor total. The Purchase Invoices "paid" figure includes later payments made against each bill. Older payments that were not against a bill only show there after you apply them to bills (5.5).
2. **Stock agrees.** Buy, sell, transfer and sell-with-service for one product and confirm the stock at each branch is what you expect.
3. **Branch access.** Log in as a single-branch user and confirm that every list is limited to that branch (invoices, purchases, outstandings, tickets, quotations).
4. **Numbers.** Invoices: `INV-<year>-<code>NNNN` per branch, and `SSM/<FY>/NNNN` across all branches. Quotations: `QT-<year>-<code>NNNN`.
5. **Run the checks:** `npm run lint` (0 errors), `npm test` (397 passing), `npm run build` (succeeds).

---

# Where things live (for the developer)

| Topic | Files |
|---|---|
| Branch list and helpers | `src/lib/data/business.ts`, `src/lib/stock.ts` |
| Variants and stock | `src/lib/db/queries/variants.ts`, `stockOps.ts` |
| Invoices and references | `src/lib/db/queries/invoices.ts`, `src/lib/billing/ledger.ts` |
| Service invoice lines | `src/lib/billing/serviceInvoice.ts`, `src/components/admin/TicketParts.tsx`, `src/app/api/repair/[id]/route.ts` |
| Quotations | `src/lib/quotation.ts`, `src/lib/db/queries/quotations.ts`, `src/components/quotation/` |
| Purchases and payments | `src/lib/db/queries/purchases.ts`, `src/components/purchases/`, `src/lib/paymentAlloc.ts`, `src/lib/vendorPayPlan.ts` |
| Purchase GST | `src/lib/gst/purchaseTax.ts` |
| Sales feed and part-payment revenue | `src/lib/client/sales.ts`, `src/app/admin/analytics/page.tsx` |
| Print / PDF / WhatsApp | `src/components/print/`, `src/lib/print/doc.ts` |
| Repair payments and receipts | `src/lib/billing/repairPayments.ts`, `src/lib/billing/repairReceipt.ts` |
| Excel export | `src/lib/reports/excel.ts` |
| Database changes | `drizzle/` (migrations 0000–0038; the newest are 0037 low-stock switch and 0038 stock log, repair payments, analytics links and expense categories) |
| Tests | `src/lib/__tests__/` |

---

# Open items

- The quotation sample file has not been received.
- Confirm with the client how products sold during a service should appear (see 6.6).
- Confirm the invoice codes for Vadapalani (`V`) and Ashok Nagar (`A`). Porur is `P`. They can be changed on the Branches page.
- There is no screen to delete or undo a vendor payment. This can be added as an admin-only action.
- Not yet seen on screen: the "Prices include GST" checkbox on purchases, the variant photo upload in Edit Product, and the stock numbers in the Purchases and Stock Transfers dropdowns. They compile and are covered by tests where there is logic.
- **Still to do from the 1 Nov requirements:** ADM-01 (status badges overflowing), ADM-02 (staff branch switcher), ADM-03 (logo, waiting for the file), INV-01 (easier Category menu), INV-04 (branch-wise stock columns), INQ-02 (WhatsApp number per branch), the delivery items (DEL-01/02), and all website items (WEB-01 to WEB-14).
- **Waiting on the client (section 12 of their document):** IGST, departments, delivery state boxes and methods, per-branch WhatsApp numbers, the final analytics layout, and confirmation that a part-paid repair gets a payment receipt with the tax invoice issued on full payment (built that way, see 7.8).
- **Not yet clicked through in the admin:** the admin screens need a Google sign-in, so 7.2, 7.4, 7.5, 7.8 and 7.11 were checked by build, tests and code only. The public invoice page's thermal print (80 mm page, receipt content), PDF download (260 KB) and CGST @ 9% labels were checked in the browser.
