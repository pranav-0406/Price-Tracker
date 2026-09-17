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
GET  /api/prices?productId=sennheiser-momentum-4-wireless
GET  /api/prices/history/black?productId=sennheiser-momentum-4-wireless&range=1M
GET  /api/comparison?productId=sennheiser-momentum-4-wireless
POST /api/alerts
GET  /api/alerts/guest
PATCH /api/alerts/:id
DELETE /api/alerts/:id
```

## Manual verification

1. Confirm the dashboard shows **DEMO DATA**, a sync time, calculated average/min/max/volatility, and a five-minute refresh label.
2. Select every color and each history range; verify the chart and table update.
3. Change sorting and platform/color/min/max filters; verify the highlighted first row is the filtered cheapest offer.
4. Open retailer links and verify they open a new tab.
5. Add a product with valid fields, then retry with a missing field and invalid URL.
6. Create email, SMS, and both-channel alerts; verify the alert appears, toggles, and deletes.
7. Resize to 375px, 768px, and desktop widths; open/close the sidebar on mobile.
8. Set provider credentials in `.env` and call the test notification endpoints only in development.

## Production data honesty

## Live retailer providers

Keepa is used for Amazon India and requires the fixed ASIN. Apify actors are used for the other fixed listings. Set each actor ID and listing URL in `.env`:

```text
KEEPA_API_KEY=
AMAZON_ASIN=
AMAZON_LISTING_URL=
APIFY_API_TOKEN=
APIFY_FLIPKART_ACTOR_ID=
APIFY_CROMA_ACTOR_ID=
APIFY_RELIANCE_DIGITAL_ACTOR_ID=
APIFY_VIJAY_SALES_ACTOR_ID=
FLIPKART_LISTING_URL=
CROMA_LISTING_URL=
RELIANCE_DIGITAL_LISTING_URL=
VIJAY_SALES_LISTING_URL=
```

Each actor must return an item containing `price` (or `currentPrice`/`salePrice`), and may return `color`, `stock`, `delivery`, `cardOffer`, and `url`. A successful response is stored with `dataMode: live`, `verified: true`, source URL, and timestamp. If live mode is configured but a provider fails, the API does not generate demo prices.

For static hosts such as Vercel, deploy the frontend as a static Vite build and configure `VITE_API_URL` to point to a separately deployed API. The included `vercel.json` only handles SPA fallback routing; it does not attempt to proxy API calls to `localhost`.
