# Price Tracker

React/Vite frontend and Node/Express API for comparing product prices across Indian retailers. Configure the live providers below to replace generated values with verified provider responses.

## Run locally

1. Copy `.env.example` to `.env`.
2. Set `MONGODB_URI` if MongoDB is available. The API remains usable with the in-memory fallback.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open `http://127.0.0.1:5173`.

`VITE_API_URL` can stay blank for local development because Vite proxies `/api` to the Express server. Set it only when the frontend is deployed separately from the API, for example `VITE_API_URL=https://your-api.example.com`.

For a production-style single process, run `npm run build` followed by `npm start`; Express serves the generated `dist` directory.

## Alert delivery

Email uses Resend and SMS uses Twilio. Configure the following variables before sending real notifications:

```text
RESEND_API_KEY=
ALERT_FROM_EMAIL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

The development-only endpoints `POST /api/test-email` and `POST /api/test-sms` send one test event. They return `404` when `NODE_ENV=production`.

Alerts are evaluated only after a scheduled price snapshot changes. Delivery attempts are idempotent per alert/event hash and include one retry. In-memory alerts and prices are intended for local verification; connect MongoDB and add persistence models before using alerts in a deployed multi-instance environment.

## API checks

```text
GET  /api/health
GET  /api/products
POST /api/products
POST /api/products/:id/refresh
DELETE /api/products/:id
GET  /api/prices?productId=sennheiser-momentum-4-wireless
GET  /api/prices/history/black?productId=sennheiser-momentum-4-wireless&range=1M
GET  /api/comparison?productId=sennheiser-momentum-4-wireless
POST /api/alerts
GET  /api/alerts/guest
PATCH /api/alerts/:id
DELETE /api/alerts/:id
```

## Manual verification

1. Confirm the dashboard shows V1 live scope status, a sync time, calculated average/min/max/volatility, and an Amazon refresh interval of at least 60 minutes.
2. Select every color and each history range; verify the chart and table update.
3. Change sorting and platform/color/min/max filters; verify the highlighted first row is the filtered cheapest offer.
4. Open retailer links and verify they open a new tab.
5. Add a product with valid fields, then retry with a missing field and invalid URL.
6. Create email, SMS, and both-channel alerts; verify the alert appears, toggles, and deletes.
7. Resize to 375px, 768px, and desktop widths; open/close the sidebar on mobile.
8. Set provider credentials in `.env` and call the test notification endpoints only in development.

## Live retailer providers

Amazon India uses a self-hosted Playwright scraper by default. If `KEEPA_API_KEY` is configured, the existing Keepa provider is selected instead. Apify actors are used for future-phase listings. Provider credentials are the only provider-specific values in `.env`:

```text
KEEPA_API_KEY=
APIFY_API_TOKEN=
APIFY_FLIPKART_ACTOR_ID=
APIFY_CROMA_ACTOR_ID=
APIFY_RELIANCE_DIGITAL_ACTOR_ID=
APIFY_VIJAY_SALES_ACTOR_ID=
```

Add a listing by pasting its URL in the dashboard or by sending `{ "url": "https://...", "targetPrice": 25000 }` to `POST /api/products`. The API detects the retailer from the hostname, extracts Amazon ASINs, rejects unsupported domains, deduplicates exact URLs, and fetches immediately. A successful response is stored with `dataMode: live`, `verified: true`, source URL, and timestamp. A failure becomes `dataMode: unavailable`; its last-known price is never treated as current and no fake history row is written.

Run `npm run seed:listings` once after the base product has been persisted to seed the known Amazon ASIN listing. All future listings are added through the UI/API. No product URLs or ASINs are stored in `.env`.

## Amazon scraper caveat

The Playwright Amazon provider is a stopgap for a personal/hobby deployment. Directly scraping Amazon may violate Amazon's Terms of Service and can trigger CAPTCHA or bot checks; it is not recommended for a public or commercial deployment at scale. The scraper uses a 60-minute minimum refresh cadence, randomized 2-4 second pre-navigation delays, and closes its browser after every fetch, but blocking remains possible and results must be treated as best-effort.

Run a real one-off probe with:

```powershell
npm.cmd run test:amazon-scraper
```

The command reports elapsed time, price/stock/title on success, or a distinct CAPTCHA error on blocking. A failed fetch is stored as unavailable and does not create price history.

## V1 scope

V1 actively fetches Amazon listings through Playwright by default, or Keepa when `KEEPA_API_KEY` is configured. Amazon refreshes run every 60 minutes through the named `AMAZON_REFRESH_MINUTES` constant; the general V1 interval remains separately named. Amazon is live only after a successful provider response.

Flipkart is intentionally gated. The app does not call an Affiliate API or scraper for a listing until that listing has `apiVerified: true`. After obtaining credentials, run:

```powershell
$env:FLIPKART_AFFILIATE_ID="..."
$env:FLIPKART_AFFILIATE_TOKEN="..."
npm.cmd run test:flipkart-compat
```

Review every listing's MATCH/MISMATCH/NO_RESULT result. The script compares returned identity and canonical URL; a 200 response alone is not enough. Only for exact MATCH URLs, run:

```powershell
npm.cmd run mark:flipkart-verified -- "https://www.flipkart.com/exact-matched-url"
```

The scheduler will then pick up those listings. The existing Apify path remains available as a future fallback but is not used for Flipkart V1.

Croma, Reliance Digital, Vijay Sales, and Sennheiser Official remain stored listings but are explicitly out of scope. They show `Coming soon`, are skipped by the scheduler, and retain the reason `retailer not yet supported in v1`.

For static hosts such as Vercel, deploy the frontend as a static Vite build and configure `VITE_API_URL` to point to a separately deployed API. The included `vercel.json` only handles SPA fallback routing; it does not attempt to proxy API calls to `localhost`.
