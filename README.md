# HSW Quote & Invoice Builder

Web version of `HSW_Quote_Invoice_Builder.xlsx`. Staff sign in with their store email, build a Quote or Tax Invoice
(scan or search items), download the PDF, and record deposits/payments. Each payment emails the store's managers.

Money rules match the workbook: prices include GST, GST = total ÷ 11, line = qty × price × (1 − disc%), blank qty = 1,
numbers `Q-<STORE>-<n>` / `INV-<STORE>-<n>`, quote valid 30 days, invoice due 7 days (or a chosen date).

## First-login tour
The first time someone signs in to their account, a short animated tour (`src/Tour.tsx`) walks through New, scanning, sending the PDF and Documents, plus payments and reports for managers and stores and people for the admin. Next and Back move through it, Skip or the X closes it, and the ? at the top replays it. The account remembers it (Supabase `user_metadata.tour_seen`), so a new phone or browser does not show it again.

## Scanning and the live draft
The camera scanner beeps on a good read and gives a lower double tone for a barcode that is not in the price list. The quote being built (not yet saved) is one **live draft per person**: every device signed in as that person shares it (`quote_drafts`, migration `015_quote_drafts.sql`, Supabase Realtime). Scan on the phone and the item shows on the computer a moment later; delete a line on either and it goes from both. If both are edited at once the changes are merged field by field (`mergeQuotes` in `src/lib/draftSync.ts`), so typing a customer name on the computer does not lose a scan from the phone. Saving the quote, or Clear form, removes the draft everywhere. A saved document being edited is not shared live. iPhones play the sound through the ringer, so it is silent when the silent switch is on.

## Deposits and payments
A manager (or the admin) can record a deposit or payment on a saved **quote** or **tax invoice**: the **Record deposit / Record payment** button on the Documents tab, or on the builder once the document is saved. The store managers are emailed the amount and the balance. A document with money recorded is frozen, and its status reads **Deposit received**, **Part paid** or **Paid in full**. A quote with a deposit shows it on the PDF and cannot be deleted. Use **Make this a tax invoice** on it, and the deposit moves across to the new invoice (migration `016_deposits_on_quotes.sql`). On Reports, **Invoiced** is the value of invoices, **Received** is what has been paid on them, and **Quote deposits** is advances held on quotes not yet invoiced.

## Who can do what
Everything about people happens on the **Stores** tab: open a store and a popup lists who is in it, lets you add someone, change their permission, reset their password, turn them off, take them out of the store, or delete them.

| | Store | Manager | Admin (`george.mridun@hsw.com.au`) |
|---|---|---|---|
| Sign in | own email + password | own email + password | own email + password |
| Quotes / invoices | make them; see and edit only their own | see and edit **all** at the store | all stores |
| Delete a quote | their own | any at the store | any |
| Delete a tax invoice | no | no | only one with no payments |
| Record payment / deposit | no | yes, at the store | any store |
| Reports (by person) | no | yes, for the store | any store or all |
| Add or delete people and stores, reset passwords | no | no | yes |

One person has one login and can be in several stores, with a different permission in each (add the same email to another store and they get it without a new password). Only the admin is built in; everyone else is a Manager or Store in each store they belong to. Every document shows who created it. **Turn off** stops someone signing in straight away without deleting their documents; **Delete user** removes the login but the quotes and invoices they made stay. A store with quotes or invoices cannot be deleted, only turned off. A store's managers receive its payment notices and a copy of what it sends. There is no emailed sign-in code: anyone stuck contacts support@hsw.com.au and the admin resets their password from the store popup.

Enforced by Row Level Security (`supabase/migrations/002_*.sql`, `012_store_members.sql`), not just the UI, and again in the `record-payment` and `send-document` functions (`_shared/access.ts`). Payments can only be written by the `record-payment` function. Once an invoice has a payment it is frozen. Who created a document never changes when someone else edits it.

## Data flow
```
Dynamics / LS Central --(Scheduler 1: sync-dynamics.yml, nightly, incremental)--> Supabase `items`
Supabase `items` --(Scheduler 2: publish-prices.yml, after each sync + weekly)--> public/items.json committed to the repo --> Vercel redeploys --> app
Store user --(record-payment function)--> payments table + email to the store's managers (Resend)
Store user --(send-document function)--> the PDF emailed to the customer (copy + replies to the store) or to the store only
```

## Why the app reads a local copy of the prices

The app never calls Dynamics or Supabase for prices. It loads `items.json`, a file that ships with the site. Prices change about once a month, so a fresh copy overnight is plenty, and:

- **If Dynamics is down**, Scheduler 1 fails and changes nothing. Supabase keeps yesterday's prices.
- **If Supabase is down**, Scheduler 2 fails and commits nothing. The repo keeps its last copy.
- **If both are down**, the app still works, because the file is served by Vercel with the site itself.
- Both schedulers refuse to replace the list with an empty or partial one (under 100 items).
- The copy lives in git, so every price change is a commit you can see and, if ever needed, roll back.
- GitHub emails the repo owner when a scheduled run fails.

### Incremental refresh

Scheduler 1 does not rewrite the catalogue each night. It fetches the item list, compares every item with what Supabase already holds (a fingerprint per item), and writes **only the items that are new or changed**. If nothing changed, nothing is written, Scheduler 2 finds no difference, and no commit or redeploy happens. Each run is recorded in `sync_log` (fetched, written, unchanged, removed).

- **Full pass:** reads everything, so it also notices items that were removed in Dynamics. This is the default.
- **Delta pass (optional):** if the web service has a "last modified" field, set the `DYN_MODIFIED_FIELD` variable (for example `Last_Date_Modified`) and the nightly run asks Dynamics only for items modified since the last run, with a full pass once a week. Check first that this field really changes when a price changes: in LS Central, prices often live in price tables and the item's own modified date may not move. If in doubt, leave it unset; the fingerprint comparison already keeps the writes minimal.
- **Safety:** a full pass that returns under 100 items, or that would mark more than 20% of items as removed, is refused.

Prices change in Dynamics, not in this app. To refresh sooner than overnight, run **Sync Dynamics → Supabase** from the Actions tab; the price copy updates right after it.

## Setup
1. **Supabase project**: Authentication → Sign In / Providers → Email: keep **Email** on, and turn **off** "Allow new users to sign up". That is the only Auth setting needed.
   **Your admin password:** Authentication → Users → *Add user* → create `george.mridun@hsw.com.au` with a strong password and tick *Auto Confirm User*. You sign in with it, and it is the only password created by hand.
   **Store passwords:** sign in as admin → **Stores** → *Set password* for each store. A strong random password is generated and shown once to hand to the store (or choose one yourself). Supabase Auth keeps only a hash of it in its own protected area; **no password or hash is ever stored in this repo or in the app's tables**, only the date it was set. Reset any time with *Reset password*.
   **Sign-in help:** there is no emailed sign-in code. The sign-in screen tells anyone who is stuck to contact support@hsw.com.au, and the admin resets their password from the store popup.
2. **Vercel**: import the GitHub repo (framework Vite, no other settings). Project → Settings → Environment Variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public by design), plus `VITE_ADOBE_FONTS_KIT` to turn on Myriad Pro (below). Vercel needs no service key: it deploys the committed price copy, and redeploys on every push.
3. **GitHub repo secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `RESEND_API_KEY`, `MAIL_FROM` (e.g. `HSW Quotes <quotes@hsw.com.au>`, a Resend-verified domain),
   and for Dynamics: `DYN_ODATA_URL` (the web service URL) plus the sign-in, which is **either** `DYN_USER` + `DYN_ACCESS_KEY` (a NAV user and its Web Service Access Key) **or** `DYN_TENANT_ID` + `DYN_CLIENT_ID` + `DYN_CLIENT_SECRET` (Business Central online).
   Optional variables: `DYN_FILTER`, `DYN_FIELD_MAP`, `DYN_MODIFIED_FIELD`, `DYN_MODIFIED_FORMAT`.
   **The server must be reachable from GitHub's servers over the internet** (an https address). If the NAV service is only on the internal network, the nightly job cannot reach it: use a self-hosted runner inside the network, or publish the service through a secure gateway.
   Before the first sync, check the connection and the field names from your own computer:
   `DYN_ODATA_URL=… DYN_USER=… DYN_ACCESS_KEY=… node scripts/sync-dynamics.mjs --discover`
4. Run **Deploy Supabase** (creates tables, loads the store list, deploys the functions), then seed prices once:
   `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed-supabase.mjs`.
5. **Myriad Pro**: it is an Adobe font and cannot be bundled. In Adobe Fonts (fonts.adobe.com, included with Creative Cloud), add Myriad Pro to a web project with the Vercel domain, tick the weights Light, Regular, Semibold and Bold, then put the project id in `VITE_ADOBE_FONTS_KIT`. The app uses Myriad Pro Light for body text. Until then the app uses Source Sans 3, a close free match. The PDF uses Helvetica.
6. Sign in as the admin → **Stores**: set each store's legal name, ABN and bank details. Then open each store to add its people: managers and Store staff, and hand over the password shown. A store's managers are its owners for email: they get its payment notices and a copy of what it sends, so no owner email is typed separately.

## Emailing quotes and invoices

**Email PDF** on the New screen sends the PDF from the app, in the store's name, using the same Resend account as the payment notices:

- *To the customer*: the PDF is attached, the store is copied (BCC) and replies go to the store's email.
- *To the store only*: sent to the store's email so the store can forward it from its own Outlook.

Every send is logged in `document_emails`, and each signed-in user is limited to 40 sends an hour.

Setup: verify the sending domain in Resend (DNS records added by whoever manages the hsw.com.au DNS), and set the `MAIL_FROM` secret. The email shows as sent from that address but under the store's name; it does not appear in the store's Outlook Sent folder. Sending from the store's real mailbox is possible later through Microsoft Graph (Mail.Send application permission, restricted to the store mailboxes by an Exchange application access policy), which needs an Entra admin.

## Develop
`npm install` · `npm run dev` (needs `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env.local`) · `npm test` · `npm run build`
