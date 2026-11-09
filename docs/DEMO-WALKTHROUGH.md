# Live demo walkthrough

A presenter script for the Smart Provision Store submission. It covers the
whole application briefly and the CRM in depth, using the seeded demo data.

**Time:** 18–22 minutes
**URL:** http://localhost:5173
**Login:** `admin@provisionstore.local` / the value configured as `SEED_ADMIN_PASSWORD`
**Store:** Smart Provision Store

---

## 1. Before the demo (5 minutes before)

Run these checks in order:

1. PostgreSQL is running on port 5432.
2. API health: open http://localhost:4000/api/v1/health — expect `{"status":"ok"}`.
3. Web app: open http://localhost:5173 and sign in.
4. If the database was reset or the CRM looks empty, reload the demo data:

   ```powershell
   $env:Path = "D:\opencode\tools\node;" + $env:Path
   $env:API_URL = "http://localhost:4000/api/v1"
   $env:SEED_ADMIN_PASSWORD = "<the password configured for the seeded administrator>"
   node scripts/demo-data.mjs
   ```

   The script is idempotent. Re-running it also resets the seeded follow-ups to
   open, so the queue is ready after a rehearsal.

**Demo data at a glance**

| Item | Value |
| --- | --- |
| Customers | 12, all active |
| Invoices | 29 across the last 7 months |
| Repeat customers | 9 (75%) |
| At-risk customers | 3 (no purchase in 60+ days) |
| Receivables | 5 customers, ₹15,300 outstanding |
| Follow-ups | 10 open (4 overdue, 2 today, 4 upcoming) |
| Occasions | 12 birthdays/anniversaries in the next 45 days |
| Segments | 3 HIGH_VALUE, 3 LOYAL, 3 REGULAR, 2 INACTIVE, 1 NEW |
| Campaigns | 1 DRAFT, 1 RUNNING with 1 of 3 messages sent |

Keep this script open on a second screen or print it.

---

## 2. Opening (1 minute)

**Say:** “This is a complete provision-store system: billing, inventory,
purchases, expenses, GST reports, staff access — and a CRM that turns the sales
data the shop already captures into repeat business.”

Sign in, then land on **Dashboard**.

---

## 3. Dashboard (2 minutes)

**Click:** Dashboard in the left sidebar.

Point out, in this order:

1. **Today's sales** and **this month's sales** — live from the invoice ledger.
2. **Receivables** — the same dues that appear in the CRM.
3. **Low stock** — products at or below the reorder level.
4. **Recent invoices** — click one to show the invoice detail and PDF.

**Talking point:** “Every number on this page is derived from real
transactions, not a static dashboard. The CRM reads the same data.”

Return to the dashboard. Do not spend longer than two minutes here.

---

## 4. CRM command centre (6 minutes)

**Click:** CRM (sidebar, under Sales).

### 4.1 The four headline numbers

**Say:** “The CRM opens on the decisions a shop owner actually has to make
today.”

- **Active customers — 12**, with new joins this month.
- **Repeat customers — 75%**, customers with two or more purchases.
- **At risk — 3**, no purchase for 60+ days.
- **Receivables — ₹15,300**, five customers with a live credit balance.

### 4.2 Follow-up queue

Point at the counter: **4 overdue · 2 today · 4 upcoming**.

1. Click **Overdue**.
2. Hover the first row, e.g. **Ganesh Kumar — Collect ₹7,800 outstanding**.
3. Point out the three actions on each row: **Call**, **WhatsApp**, **Done**.
4. Click **WhatsApp** on one row to show the pre-filled click-to-chat message.
   Close the WhatsApp tab without sending.
5. Click **Done** on one overdue item. The row disappears and the counts drop.

**Say:** “The follow-up is not a separate task list. It is attached to the
customer, it appears on their timeline, and completing it here updates the same
record.”

> If you complete one during rehearsal, re-run the demo data script to restore
> the queue.

### 4.3 Birthdays and anniversaries

Scroll to **Upcoming birthdays & anniversaries**.

- The list is sorted by how soon the date is.
- Click **Greet** on a row to show the personalised WhatsApp message.
- Highlight **Priya Raman — birthday 12 November, in 3 days** and **Divya
  Krishnan — anniversary 15 November**.

**Say:** “Dates are captured once on the customer profile. The CRM does the
date maths and gives staff a one-click greeting.”

### 4.4 Credit-due alerts

Scroll to **Credit-due alerts** on the right.

- Each row shows the outstanding amount, the credit limit and the payment
  terms.
- Click **Remind** on Ganesh to show the pre-filled balance reminder.
- Click the customer name to jump straight to their profile.

**Say:** “Credit sales are only safe if someone chases the balance. This is the
collections worklist, ordered by exposure.”

### 4.5 Segment mix and top customers

- **Segment mix:** HIGH_VALUE 3, LOYAL 3, REGULAR 3, INACTIVE 2, NEW 1.
- **Average lifetime value ₹10,332.75**; **lifetime sales ₹1,23,993**.
- **Top customers:** Priya Raman, Ganesh Kumar, Karthik Subramanian.

**Say:** “Segments are recalculated from purchase count, lifetime spend and
recency. They are not labels staff have to maintain by hand.”

Optional: click **Refresh segments** to show the recalculation toast.

### 4.6 Campaigns

Scroll to **Campaigns**.

1. Point out the **DRAFT — Diwali VIP preview** campaign. Open it with **Open**.
   - The dialog shows the message template, audience size and recipient list.
   - Each recipient has a personalised message and a **Send** button.
   - **Send** opens WhatsApp with that customer's message; **Mark sent** records
     it in the campaign.
   - Close the dialog.
2. Point out the **RUNNING — Win-back: 60-day lapsed** campaign (1 of 3 sent).
   - Open it, click **Pending**, choose one recipient.
   - Click **Send**, then close WhatsApp and come back and click **Mark sent**.
   - The sent count becomes 2 of 3.
   - Close the dialog and click **Complete** on the campaign card.
   - Show the status changing to COMPLETED.

**Say:** “The CRM is provider-independent. It snapshots the audience, builds a
personal WhatsApp link per customer and tracks what staff have actually sent.
No paid messaging API is required for the demo — but the same records would
drive one.”

3. Create a campaign live (optional if time allows):
   - Click **New campaign**.
   - Name: `Weekend staples offer`.
   - Message: `Hi {firstName}, fresh stock has arrived at {store}. Show this message for 5% off this weekend.`
   - Audience: Segment **LOYAL**, minimum spend `5000`.
   - Point at the **Audience preview** count and sample names.
   - Click **Save draft**. The new draft appears in the list, ready to launch.
   - Delete it with **Delete** if you created it only for the demo.

---

## 5. Customer 360 (5 minutes)

**Click:** Customers (sidebar) → **Priya Raman**.

### 5.1 Header and money strip

Point out:

- Customer code, mobile, email, segment badge and active status.
- **Call**, **WhatsApp**, **Email**, **Follow-up** and **Record payment**
  actions.
- **Outstanding**, **Available credit**, **Lifetime spend**, **Loyalty points**.

**Say:** “Everything a counter person needs before picking up the phone is on
one screen.”

### 5.2 Customer 360 tabs

Walk the tabs left to right:

1. **Timeline** — calls, notes, follow-ups, invoices, payments and loyalty in
   one chronological feed. Point out the colour-coded entries and the follow-up
   status.
2. **Invoices** — click a row to open the invoice.
3. **Ledger** — the running balance, debit and credit entries.
4. **Payments** — method, reference and date.
5. **Loyalty** — points earned and redeemed.
6. **Campaigns** — the campaigns this customer was included in, with a direct
   WhatsApp link.

### 5.3 Log a note and a follow-up

1. On the Timeline tab, click **Log note**.
2. Type: `Called about the Diwali hamper order. Wants delivery on 12 November.`
3. Save. The note appears at the top of the timeline immediately.
4. Click **Follow-up** in the page header.
5. Subject: `Confirm Diwali hamper delivery slot`.
6. Due: tomorrow.
7. Save. The follow-up appears on the timeline and in the CRM queue.

**Say:** “This is the difference between a contact list and a CRM: the next
action is captured against the customer, with an owner and a due date.”

### 5.4 Buying insights

Scroll the right-hand column:

- **Average order**, **days since last purchase**, **credit utilisation**,
  **returns**, **open follow-up**.
- **Favourite products** — ranked by revenue.
- **Six-month spend** — the mini trend.

**Say:** “This is the context that turns a reminder into a relevant
conversation.”

Optional: on Divya Krishnan's profile, click **Record payment**, enter ₹500 by
UPI and save. The outstanding balance, ledger and timeline all update together.
Use Divya rather than Ganesh so the large demo balance stays visible.

---

## 6. Customers list: tags, import and export (3 minutes)

**Click:** Customers.

1. Point out the summary cards and the segment filter.
2. Filter by **HIGH_VALUE** and show Priya, Karthik and Ganesh.
3. Point out the **Tags** column: VIP, wholesale, at-risk, credit, festive.
4. Click **Export CSV**. The file downloads with the full customer book.
5. Click **Import**.
   - Click **Load sample** (or paste a CSV).
   - Show that existing mobiles are updated and new mobiles are created.
   - Point out the result summary: added, updated, skipped, errors.
   - Close without importing if the sample mobile already exists.

**Say:** “A shop moving from Excel can bring its customer book in on day one,
and take it back out at any time. No lock-in.”

---

## 7. Optional: billing and stock proof (2 minutes)

Only if the audience asks “does the rest actually work?”.

1. **Point of Sale** (sidebar): scan/search a product, add it to the cart,
   choose Cash, complete the sale. Show the change due and the invoice.
2. **Stock** (sidebar): show the quantity dropping and the movement history.
3. **Reports** (sidebar): open **Sales summary** and **GST summary**, then export
   to Excel or PDF.

**Say:** “The CRM is built on the same ledger as billing and inventory, so
there is no second database to reconcile.”

---

## 8. Close (1 minute)

**Say:** “The shop gets one system for billing, stock, purchases, expenses, GST
and staff access — plus a CRM that uses that same data to bring customers back.
Follow-ups, occasions, credit dues, segments and WhatsApp campaigns are all
live, and every button in the demo performs a real action.”

Then stop. Do not add features verbally that were not shown.

---

## Backup answers

**“Are WhatsApp messages sent automatically?”**
No. The CRM generates a personalised click-to-chat link and tracks manual
sends. That keeps the demo provider-independent and costs nothing. The same
recipient records can be wired to the WhatsApp Business API later without
changing the campaign model.

**“Is the data real?”**
The products, customers, invoices and payments are created through the same
public API the UI uses, then backdated so the dashboards show realistic
history. No dashboard numbers are hard-coded.

**“What happens when a customer pays?”**
The payment writes to the customer ledger, updates the invoice balance,
appears on the timeline and reduces the credit-due alert.

**“Can staff see everything?”**
No. Permissions are role-based. Cashiers can read customers and use activities,
but campaign creation is limited to Admin and Manager. The Roles & access
screen controls it.

**“How do we reset the demo?”**
Re-run `scripts/demo-data.mjs`. It is idempotent and restores the follow-up
queue, campaigns and history.

---

## Presenter checklist

- [ ] API health OK
- [ ] Web app signed in as admin
- [ ] CRM shows 12 customers, 5 receivables, 10 follow-ups
- [ ] Diwali campaign is DRAFT
- [ ] Win-back campaign is RUNNING with 1 of 3 sent
- [ ] Priya Raman has a birthday in 3 days
- [ ] WhatsApp opens click-to-chat in a new tab
- [ ] Export CSV downloads
- [ ] Notifications/toasts are visible
- [ ] Second screen or printed copy of this script
