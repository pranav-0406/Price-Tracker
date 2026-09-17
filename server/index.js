import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import rateLimit from 'express-rate-limit'
import twilio from 'twilio'
import crypto from 'node:crypto'
import { AlertModel, ListingModel, PriceHistoryModel, PriceModel, ProductModel } from './models.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || 3001)
const isProduction = process.env.NODE_ENV === 'production'
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean)
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }))
app.use(express.json({ limit: '20kb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }))

const retailerConfig = [
  { key: 'amazon', name: 'Amazon', short: 'a', colorHex: '#f59e0b' },
  { key: 'flipkart', name: 'Flipkart', short: 'f', colorHex: '#2874f0' },
  { key: 'croma', name: 'Croma', short: 'c', colorHex: '#18a558' },
  { key: 'reliance_digital', name: 'Reliance Digital', short: 'r', colorHex: '#147dff' },
  { key: 'vijay_sales', name: 'Vijay Sales', short: 'v', colorHex: '#e84646' },
]
const colors = [
  { name: 'Black', value: 'black', colorHex: '#252525' },
  { name: 'White', value: 'white', colorHex: '#f5f5f2' },
  { name: 'Silver', value: 'silver', colorHex: '#bfc5c8' },
  { name: 'Denim', value: 'denim', colorHex: '#3e5f83' },
  { name: 'Graphite', value: 'graphite', colorHex: '#4c5054' },
  { name: 'Copper', value: 'copper', colorHex: '#b46b52' },
  { name: 'Green', value: 'green', colorHex: '#526a5a' },
]

const generateProduct = (name, brand = 'Generic', category = 'Headphones', sourceUrl = 'https://www.amazon.in/') => {
  const cleanName = name.trim()
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-product'
  const basePrice = 18999 + cleanName.length * 111
  return {
    id: `${slug}-${crypto.randomBytes(3).toString('hex')}`,
    name: cleanName,
    brand: brand.trim(),
    category,
    sku: `${brand.toUpperCase().slice(0, 4)}-${slug.slice(0, 8).toUpperCase()}`,
    sourceUrl,
    dataMode: 'demo',
    image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=800&q=85',
    description: `${cleanName} · premium audio device for everyday listening`,
    specs: { bluetooth: '5.2 · aptX Adaptive', battery: 'Up to 60 hours', connectivity: 'Wireless & USB-C', weight: '293 g' },
    colors: colors.map((color, index) => ({ ...color, image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=300&q=85', price: basePrice + index * 1500, stock: 'In stock' })),
  }
}

const catalog = [generateProduct('Sennheiser Momentum 4 Wireless', 'Sennheiser')]
catalog[0].id = 'sennheiser-momentum-4-wireless'
const listings = []
const priceSnapshots = new Map()
const historyStore = new Map()
const alerts = []
let lastSyncAt = null
let mongoStatus = 'not_configured'
let mongoReady = false
let liveProviderStatus = 'not_configured'

const getProduct = (productId) => catalog.find((item) => item.id === productId) || catalog[0]
const retailerByKey = (key) => retailerConfig.find((item) => item.key === key)
const detectRetailer = (value) => {
  let hostname
  try { hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '') } catch { throw new Error('A valid product URL is required') }
  const match = retailerConfig.find((retailer) => hostname === retailer.key.replace('_', '') || (
    retailer.key === 'amazon' && hostname === 'amazon.in') || (retailer.key === 'flipkart' && hostname === 'flipkart.com') ||
    (retailer.key === 'croma' && hostname === 'croma.com') || (retailer.key === 'reliance_digital' && hostname === 'reliancedigital.in') ||
    (retailer.key === 'vijay_sales' && hostname === 'vijaysales.com'))
  if (!match) throw new Error(`Unsupported retailer domain: ${hostname}`)
  return match.key
}
const extractAsin = (value) => {
  const url = new URL(value)
  const match = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i) || url.search.match(/[?&]asin=([A-Z0-9]{10})(?:&|$)/i)
  if (!match) throw new Error('Amazon URL must contain a valid ASIN in /dp/, /gp/product/, or asin= format')
  return match[1].toUpperCase()
}
const listingView = (listing) => ({ ...listing, retailerName: retailerByKey(listing.retailer)?.name || listing.retailer })
const createSnapshot = (productId) => {
  const product = getProduct(productId)
  return product.colors.flatMap((color, colorIndex) => retailerConfig.map((retailer, index) => {
    const oldPrice = Math.max(11700, color.price + (index + 1) * 210 + colorIndex * 100)
    const price = Math.max(11700, oldPrice + ((Date.now() / 300000 + index + colorIndex) % 2 > 1 ? -350 : 180))
    return {
      platform: retailer.name, short: retailer.short, colorHex: retailer.colorHex, color: color.name, colorValue: color.value,
      price: Math.round(price), previous: Math.round(oldPrice), change: Number((((price - oldPrice) / oldPrice) * 100).toFixed(1)),
      stock: index % 3 === 1 ? 'Only 2 left' : 'In stock', delivery: index % 2 ? '₹99 delivery' : 'Free delivery',
      url: `${retailer.url}search?q=${encodeURIComponent(product.name)}`, cardOffer: index % 2 === 0,
      verified: false, dataMode: 'demo', lastUpdated: new Date().toISOString(),
    }
  }))
}
const liveModeConfigured = () => Boolean(process.env.KEEPA_API_KEY || process.env.APIFY_API_TOKEN)
const asNumber = (value) => {
  const number = Number(String(value ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}
const normalizedLiveEntry = (retailer, raw, product) => {
  const price = asNumber(raw.price ?? raw.currentPrice ?? raw.salePrice ?? raw.offerPrice)
  if (!price) return null
  const color = colors.find((item) => item.value === String(raw.colorValue || raw.color || 'black').toLowerCase()) || colors[0]
  return {
    platform: retailer.name, short: retailer.short, colorHex: retailer.colorHex,
    color: color.name, colorValue: color.value, price, previous: asNumber(raw.previous),
    change: raw.previous ? Number((((price - Number(raw.previous)) / Number(raw.previous)) * 100).toFixed(1)) : 0,
    stock: raw.stock === false || raw.available === false ? 'Out of stock' : (raw.stock || 'In stock'),
    delivery: raw.delivery || 'Check retailer', url: raw.url,
    cardOffer: Boolean(raw.cardOffer), verified: true, dataMode: 'live',
    lastUpdated: new Date().toISOString(), source: raw.source || retailer.name,
  }
}
const fetchListing = async (listing, product) => {
  const retailer = retailerByKey(listing.retailer)
  if (!retailer) throw new Error(`No provider for retailer ${listing.retailer}`)
  if (listing.retailer === 'amazon') {
    if (!process.env.KEEPA_API_KEY) throw new Error('KEEPA_API_KEY is not configured')
    const response = await fetch(`https://api.keepa.com/product?key=${encodeURIComponent(process.env.KEEPA_API_KEY)}&domain=10&asin=${encodeURIComponent(listing.asin)}&stats=1`)
    if (!response.ok) throw new Error(`Keepa returned HTTP ${response.status}`)
    const item = (await response.json()).products?.[0]
    const price = item?.stats?.current?.[0]
    const result = normalizedLiveEntry(retailer, { price: price > 0 ? price / 100 : null, url: listing.url, color: item?.color, source: 'Keepa' }, product)
    if (!result) throw new Error('Keepa returned no current price')
    return result
  }
  const actorId = process.env[`APIFY_${listing.retailer.toUpperCase()}_ACTOR_ID`]
  if (!process.env.APIFY_API_TOKEN || !actorId) throw new Error(`Apify actor is not configured for ${listing.retailer}`)
  const items = await apifyRun(actorId, { urls: [listing.url], productUrl: listing.url })
  const result = items.map((item) => normalizedLiveEntry(retailer, { ...item, url: item.url || listing.url }, product)).find(Boolean)
  if (!result) throw new Error('Apify returned no usable price')
  return result
}
const updateListing = async (listing, result, error) => {
  listing.lastCheckedAt = new Date().toISOString()
  if (result) {
    listing.lastPrice = result.price
    listing.lastStock = result.stock
    listing.variant = result.colorValue
    listing.lastSuccessAt = listing.lastCheckedAt
    listing.dataMode = 'live'
    listing.verified = true
    listing.consecutiveFailures = 0
    if (mongoReady && listing._id) await ListingModel.findByIdAndUpdate(listing._id, listing)
    if (mongoReady && listing._id) await PriceHistoryModel.create({ listingId: listing._id, productId: listing.productId, retailer: listing.retailer, variant: listing.variant, price: result.price, stock: result.stock, url: listing.url, fetchedAt: listing.lastSuccessAt, verified: true })
    return result
  }
  listing.dataMode = 'unavailable'
  listing.verified = false
  listing.consecutiveFailures = (listing.consecutiveFailures || 0) + 1
  if (mongoReady && listing._id) await ListingModel.findByIdAndUpdate(listing._id, listing)
  console.error(`Listing refresh failed (${listing.url}): ${error.message}`)
  return null
}
const refreshListings = async () => {
  const active = listings.filter((listing) => listing.active)
  const previous = new Map(priceSnapshots)
  const grouped = new Map()
  for (const listing of active) {
    const product = getProduct(listing.productId)
    try {
      const result = await fetchListing(listing, product)
      const updated = await updateListing(listing, result)
      if (updated) {
        const row = { ...updated, listingId: listing.id || listing._id?.toString(), listingUrl: listing.url }
        grouped.set(listing.productId, [...(grouped.get(listing.productId) || []), row])
        historyStore.set(listing.productId, [...(historyStore.get(listing.productId) || []), { ...row, date: listing.lastSuccessAt }].slice(-2160))
      }
    } catch (error) { await updateListing(listing, null, error) }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  for (const product of catalog) {
    const next = grouped.get(product.id) || []
    priceSnapshots.set(product.id, next)
    product.dataMode = active.some((item) => item.productId === product.id && item.dataMode === 'live') ? 'live' : (active.some((item) => item.productId === product.id) ? 'unavailable' : (liveModeConfigured() ? 'live' : 'demo'))
    if (next.length) await persistPrices(product.id, next)
    await evaluateAlerts(product, previous.get(product.id) || [])
  }
  liveProviderStatus = active.length && active.some((item) => item.dataMode === 'live') ? 'connected' : (active.length ? 'error' : 'not_configured')
}
const apifyRun = async (actorId, input) => {
  const response = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(process.env.APIFY_API_TOKEN)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error(`Apify ${actorId} returned HTTP ${response.status}`)
  const data = await response.json()
  return Array.isArray(data) ? data : [data]
}
const fetchLivePrices = async (product) => {
  const entries = []
  const errors = []
  if (process.env.KEEPA_API_KEY && process.env.AMAZON_ASIN) {
    try {
      const response = await fetch(`https://api.keepa.com/product?key=${encodeURIComponent(process.env.KEEPA_API_KEY)}&domain=10&asin=${encodeURIComponent(process.env.AMAZON_ASIN)}&stats=1`)
      if (!response.ok) throw new Error(`Keepa returned HTTP ${response.status}`)
      const payload = await response.json()
      const item = payload.products?.[0]
      const price = item?.stats?.current?.[0]
      const result = normalizedLiveEntry(retailerConfig[0], { price: price > 0 ? price / 100 : null, url: process.env.AMAZON_LISTING_URL, color: item?.color, source: 'Keepa' }, product)
      if (result) entries.push(result); else throw new Error('Keepa returned no current price')
    } catch (error) { errors.push(`Amazon: ${error.message}`) }
  }
  for (const retailer of retailerConfig.slice(1)) {
    const actorId = process.env[`APIFY_${retailer.name.toUpperCase().replace(/[^A-Z]+/g, '_')}_ACTOR_ID`]
    const listingUrl = process.env[retailer.env]
    if (!process.env.APIFY_API_TOKEN || !actorId || !listingUrl) continue
    try {
      const items = await apifyRun(actorId, { urls: [listingUrl], productUrl: listingUrl })
      for (const item of items) {
        const result = normalizedLiveEntry(retailer, { ...item, url: item.url || listingUrl }, product)
        if (result) entries.push(result)
      }
      if (!items.length) throw new Error('Actor returned no items')
    } catch (error) { errors.push(`${retailer.name}: ${error.message}`) }
  }
  if (errors.length) console.error(`Live price provider errors: ${errors.join('; ')}`)
  return entries
}
const refreshSnapshots = async () => {
  if (listings.length || liveModeConfigured()) return refreshListings()
  const previous = new Map(priceSnapshots)
  lastSyncAt = new Date().toISOString()
  for (const product of catalog) {
    const livePrices = liveModeConfigured() ? await fetchLivePrices(product) : []
    const next = liveModeConfigured() ? livePrices : createSnapshot(product.id)
    product.dataMode = livePrices.length ? 'live' : (liveModeConfigured() ? 'live' : 'demo')
    liveProviderStatus = liveModeConfigured() ? (livePrices.length ? 'connected' : 'error') : 'not_configured'
    priceSnapshots.set(product.id, next)
    const existing = historyStore.get(product.id) || []
    historyStore.set(product.id, [...existing, ...next.map((entry) => ({ ...entry, date: lastSyncAt }))].slice(-2160))
    await persistProduct(product)
    await persistPrices(product.id, next)
    await evaluateAlerts(product, previous.get(product.id) || [])
  }
}
const buildHistory = (productId, colorValue, days) => {
  const product = getProduct(productId)
  if (product.dataMode !== 'live') return []
  const base = product.colors.find((color) => color.value === colorValue)?.price || product.colors[0].price
  const points = Math.max(7, Math.min(90, days))
  return Array.from({ length: points }, (_, index) => {
    const date = new Date(Date.now() - (points - index - 1) * 86400000)
    const row = { date: `${date.getDate()} ${date.toLocaleString('en', { month: 'short' })}` }
    retailerConfig.forEach((retailer, retailerIndex) => {
      row[retailer.name] = Math.round(Math.max(11700, base + Math.sin((index + retailerIndex) / 4) * 900 + retailerIndex * 240))
    })
    return row
  })
}

async function sendNotification(alert, event) {
  const channels = alert.notify === 'both' ? ['email', 'sms'] : [alert.notify]
  const result = { channels, status: 'failed', sentAt: null, errors: [] }
  const product = getProduct(alert.productId)
  const subject = `${product.name} price alert: ₹${event.price.toLocaleString('en-IN')}`
  const html = `<h2>${product.name}</h2><p>${event.color} at ${event.platform}: ₹${event.price.toLocaleString('en-IN')}</p><p><a href="${event.url}">Buy Now</a></p>`
  for (const channel of channels) {
    try {
      if (channel === 'email') {
        if (!process.env.RESEND_API_KEY || !process.env.ALERT_FROM_EMAIL || !alert.email) throw new Error('Resend or recipient is not configured')
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to: [alert.email], subject, html }),
        })
        if (!response.ok) throw new Error(`Resend returned HTTP ${response.status}`)
      } else {
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER || !alert.phone) throw new Error('SMS provider or recipient is not configured')
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        await client.messages.create({ body: `${product.name} ${event.color}: ₹${event.price.toLocaleString('en-IN')} at ${event.platform}. ${event.url}`, from: process.env.TWILIO_PHONE_NUMBER, to: alert.phone })
      }
    } catch (error) {
      try {
        if (channel === 'email' && process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL && alert.email) {
          const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
            body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to: [alert.email], subject, html }),
          })
          if (!response.ok) throw new Error(`Resend retry returned HTTP ${response.status}`)
        } else throw error
      } catch (retryError) {
        result.errors.push(`${channel}: ${retryError.message}`)
      }
    }
  }
  result.status = result.errors.length ? 'failed' : 'sent'
  result.sentAt = result.status === 'sent' ? new Date().toISOString() : null
  return result
}
async function evaluateAlerts(product, previous) {
  const current = priceSnapshots.get(product.id) || []
  for (const alert of alerts.filter((item) => item.productId === product.id && item.status === 'active')) {
    const event = current.find((entry) => entry.colorValue === alert.color && (alert.platform === 'any' || entry.platform === alert.platform))
    const old = previous.find((entry) => entry.platform === event?.platform && entry.colorValue === event?.colorValue)
    if (!event || !old || event.price === old.price) continue
    const triggered = alert.alertType === 'price_drop' && event.price <= Number(alert.condition) && event.price < old.price
      || alert.alertType === 'cheaper_retailer' && event.price < old.price
      || alert.alertType === 'back_in_stock' && old.stock !== 'In stock' && event.stock === 'In stock'
      || alert.alertType === 'card_offer' && event.cardOffer && !old.cardOffer
    if (!triggered) continue
    const eventHash = crypto.createHash('sha256').update(`${alert.id}:${event.platform}:${event.colorValue}:${event.price}:${event.stock}:${event.cardOffer}`).digest('hex')
    if (alert.lastEventHash === eventHash) continue
    alert.lastEventHash = eventHash
    alert.delivery = await sendNotification(alert, event)
  }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoStatus, lastSyncAt, dataMode: liveProviderStatus === 'connected' ? 'live' : (listings.length || liveModeConfigured() ? 'live_unavailable' : 'demo'), providers: liveProviderStatus }))
app.get('/api/products', (_req, res) => res.json({ products: catalog.map((product) => ({ ...product, listings: listings.filter((listing) => listing.productId === product.id).map(listingView) })) }))
app.post('/api/products', async (req, res) => {
  const { url = req.body?.sourceUrl, targetPrice } = req.body || {}
  if (!url?.trim()) return res.status(400).json({ error: 'Product URL is required' })
  let retailer
  try { retailer = detectRetailer(url) } catch (error) { return res.status(400).json({ error: error.message }) }
  let asin
  if (retailer === 'amazon') {
    try { asin = extractAsin(url) } catch (error) { return res.status(400).json({ error: error.message }) }
  }
  if (listings.some((listing) => listing.url === url)) return res.status(409).json({ error: 'This URL is already being tracked' })
  if (mongoReady && await ListingModel.exists({ url })) return res.status(409).json({ error: 'This URL is already being tracked' })
  const product = getProduct(req.body.productId)
  const listing = { id: crypto.randomUUID(), productId: product.id, retailer, url, variant: 'unknown', asin, active: true, dataMode: 'unavailable', verified: false, consecutiveFailures: 0, targetPrice }
  listings.push(listing)
  await persistListing(listing)
  await refreshListings()
  return res.status(201).json({ product: { ...product, listings: listings.filter((item) => item.productId === product.id).map(listingView) }, listing: listingView(listing) })
})
app.post('/api/products/:id/refresh', async (req, res) => {
  const listing = listings.find((item) => item.id === req.params.id || item._id?.toString() === req.params.id)
  if (!listing) return res.status(404).json({ error: 'Listing not found' })
  try {
    const result = await fetchListing(listing, getProduct(listing.productId))
    const price = await updateListing(listing, result)
    priceSnapshots.set(listing.productId, [...(priceSnapshots.get(listing.productId) || []).filter((item) => item.listingId !== listing.id), { ...price, listingId: listing.id, listingUrl: listing.url }])
    return res.json({ listing: listingView(listing), price })
  } catch (error) {
    await updateListing(listing, null, error)
    return res.status(502).json({ listing: listingView(listing), error: error.message })
  }
})
app.delete('/api/products/:id', async (req, res) => {
  const listing = listings.find((item) => item.id === req.params.id || item._id?.toString() === req.params.id)
  if (!listing) return res.status(404).json({ error: 'Listing not found' })
  listing.active = false
  if (mongoReady && listing._id) await ListingModel.findByIdAndUpdate(listing._id, { active: false })
  return res.status(204).end()
})
app.get('/api/product/specs', (req, res) => res.json(getProduct(req.query.productId)))
app.get('/api/prices', (req, res) => {
  const product = getProduct(req.query.productId)
  const prices = priceSnapshots.get(product.id) || []
  const values = prices.map((entry) => entry.price)
  const average = values.reduce((sum, value) => sum + value, 0) / (values.length || 1)
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length || 1)
  res.json({ updatedAt: lastSyncAt, dataMode: product.dataMode, prices, stats: { average: values.length ? Math.round(average) : null, lowest: values.length ? Math.min(...values) : null, highest: values.length ? Math.max(...values) : null, volatility: values.length ? Math.sqrt(variance) : null } })
})
app.get('/api/prices/history/:color', (req, res) => {
  const rangeDays = { '1W': 7, '1M': 30, '3M': 90 }[req.query.range] || 90
  const product = getProduct(req.query.productId)
  res.json({ color: req.params.color, range: rangeDays, dataMode: product.dataMode, history: product.dataMode === 'live' ? (historyStore.get(product.id) || []).filter((item) => item.colorValue === req.params.color) : [] })
})
app.get('/api/comparison', (req, res) => res.json({ productId: getProduct(req.query.productId).id, offers: [...(priceSnapshots.get(getProduct(req.query.productId).id) || [])].sort((a, b) => a.price - b.price) }))
app.post('/api/alerts', async (req, res) => {
  const { productId, color = 'black', alertType = 'price_drop', condition, notify = 'email', email, phone, platform = 'any' } = req.body || {}
  if (!['price_drop', 'cheaper_retailer', 'back_in_stock', 'card_offer'].includes(alertType) || !['email', 'sms', 'both'].includes(notify)) return res.status(400).json({ error: 'Invalid alert type or notification channel' })
  if (alertType === 'price_drop' && (!Number.isFinite(Number(condition)) || Number(condition) <= 0)) return res.status(400).json({ error: 'Target price must be a positive number' })
  if ((notify === 'email' || notify === 'both') && !email) return res.status(400).json({ error: 'Email is required for this notification channel' })
  if ((notify === 'sms' || notify === 'both') && !phone) return res.status(400).json({ error: 'Phone is required for this notification channel' })
  const alert = { id: crypto.randomUUID(), userId: 'guest', productId: getProduct(productId).id, color, platform, alertType, condition, notify, email, phone, status: 'active', delivery: { status: 'pending' }, createdAt: new Date().toISOString() }
  alerts.unshift(alert)
  await persistAlert(alert)
  res.status(201).json({ alert })
})
app.get('/api/alerts/:userId', (req, res) => res.json({ userId: req.params.userId, alerts }))
app.patch('/api/alerts/:id', async (req, res) => {
  const alert = alerts.find((item) => item.id === req.params.id)
  if (!alert) return res.status(404).json({ error: 'Alert not found' })
  if (typeof req.body.status === 'string') alert.status = req.body.status === 'active' ? 'active' : 'inactive'
  await persistAlert(alert)
  return res.json({ alert })
})
app.delete('/api/alerts/:id', async (req, res) => {
  const index = alerts.findIndex((item) => item.id === req.params.id)
  if (index < 0) return res.status(404).json({ error: 'Alert not found' })
  alerts.splice(index, 1)
  if (mongoReady) {
    try {
      await AlertModel.deleteOne({ id: req.params.id })
    } catch (error) {
      console.error('Alert deletion persistence failed:', error.message)
    }
  }
  return res.status(204).end()
})
app.post('/api/test-email', async (req, res) => {
  if (isProduction) return res.status(404).json({ error: 'Not found' })
  const result = await sendNotification({ ...req.body, notify: 'email' }, { product: req.body.product, color: req.body.color || 'Black', price: Number(req.body.price || 11700), platform: req.body.platform || 'Amazon', url: req.body.url || 'https://www.amazon.in/' })
  return res.status(result.status === 'sent' ? 200 : 502).json(result)
})
app.post('/api/test-sms', async (req, res) => {
  if (isProduction) return res.status(404).json({ error: 'Not found' })
  const result = await sendNotification({ ...req.body, notify: 'sms' }, { product: req.body.product, color: req.body.color || 'Black', price: Number(req.body.price || 11700), platform: req.body.platform || 'Amazon', url: req.body.url || 'https://www.amazon.in/' })
  return res.status(result.status === 'sent' ? 200 : 502).json(result)
})

cron.schedule('*/5 * * * *', () => refreshSnapshots().catch((error) => console.error('Price refresh failed:', error)))
const persistProduct = async (product) => {
  if (!mongoReady) return
  try {
    await ProductModel.findOneAndUpdate({ productId: product.id }, productToDocument(product), { upsert: true, setDefaultsOnInsert: true })
  } catch (error) {
    console.error('Product persistence failed:', error.message)
  }
}
const persistPrices = async (productId, prices) => {
  if (!mongoReady) return
  try {
    await PriceModel.insertMany(prices.map((price) => ({ ...price, productId, lastUpdated: price.lastUpdated })))
  } catch (error) {
    console.error('Price persistence failed:', error.message)
  }
}
const persistAlert = async (alert) => {
  if (!mongoReady) return
  try {
    await AlertModel.findOneAndUpdate({ id: alert.id }, alert, { upsert: true, setDefaultsOnInsert: true })
  } catch (error) {
    console.error('Alert persistence failed:', error.message)
  }
}
const persistListing = async (listing) => {
  if (!mongoReady) return listing
  const document = await ListingModel.findOneAndUpdate({ productId: listing.productId, url: listing.url }, listing, { upsert: true, new: true, setDefaultsOnInsert: true })
  Object.assign(listing, document.toObject())
  return listing
}
const productToDocument = (product) => ({ productId: product.id, name: product.name, brand: product.brand, category: product.category, sku: product.sku, sourceUrl: product.sourceUrl, description: product.description, specs: product.specs, colors: product.colors, dataMode: product.dataMode })

if (process.env.MONGODB_URI) {
  const connectMongo = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
      mongoStatus = 'connected'
      mongoReady = true
      await Promise.all(catalog.map((product) => persistProduct(product)))
      const storedListings = await ListingModel.find({ active: true }).lean()
      listings.push(...storedListings.map((listing) => ({ ...listing, id: listing._id.toString() })))
      if (listings.length) await refreshListings()
      await Promise.all([...priceSnapshots.entries()].map(([productId, prices]) => persistPrices(productId, prices)))
      await Promise.all(alerts.map((alert) => persistAlert(alert)))
    } catch (error) {
      mongoStatus = 'unavailable'
      mongoReady = false
      console.error('MongoDB connection failed:', error.message)
      setTimeout(connectMongo, 10000)
    }
  }
  mongoose.connection.on('disconnected', () => {
    mongoStatus = 'disconnected'
    mongoReady = false
    setTimeout(connectMongo, 10000)
  })
  connectMongo()
}

await refreshSnapshots()
app.use(express.static('dist'))
app.get('*', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile('index.html', { root: 'dist' }))
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }))
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Internal server error' }) })
app.listen(port, () => console.log(`API listening on port ${port}`))
