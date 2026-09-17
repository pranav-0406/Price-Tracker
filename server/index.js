import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import rateLimit from 'express-rate-limit'
import sgMail from '@sendgrid/mail'
import twilio from 'twilio'
import crypto from 'node:crypto'
import { AlertModel, PriceModel, ProductModel } from './models.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || 3001)
const isProduction = process.env.NODE_ENV === 'production'
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean)
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }))
app.use(express.json({ limit: '20kb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }))

const retailerConfig = [
  { name: 'Amazon', short: 'a', colorHex: '#f59e0b', url: 'https://www.amazon.in/' },
  { name: 'Flipkart', short: 'f', colorHex: '#2874f0', url: 'https://www.flipkart.com/' },
  { name: 'Croma', short: 'c', colorHex: '#18a558', url: 'https://www.croma.com/' },
  { name: 'JioMart', short: 'j', colorHex: '#147dff', url: 'https://www.jiomart.com/' },
  { name: 'Vijay Sales', short: 'v', colorHex: '#e84646', url: 'https://www.vijaysales.com/' },
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
const priceSnapshots = new Map()
const historyStore = new Map()
const alerts = []
let lastSyncAt = null
let mongoStatus = 'not_configured'
let mongoReady = false

const getProduct = (productId) => catalog.find((item) => item.id === productId) || catalog[0]
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
const refreshSnapshots = async () => {
  const previous = new Map(priceSnapshots)
  lastSyncAt = new Date().toISOString()
  for (const product of catalog) {
    const next = createSnapshot(product.id)
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
        if (!process.env.SENDGRID_API_KEY || !process.env.ALERT_FROM_EMAIL || !alert.email) throw new Error('Email provider or recipient is not configured')
        sgMail.setApiKey(process.env.SENDGRID_API_KEY)
        await sgMail.send({ to: alert.email, from: process.env.ALERT_FROM_EMAIL, subject, html })
      } else {
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER || !alert.phone) throw new Error('SMS provider or recipient is not configured')
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        await client.messages.create({ body: `${product.name} ${event.color}: ₹${event.price.toLocaleString('en-IN')} at ${event.platform}. ${event.url}`, from: process.env.TWILIO_PHONE_NUMBER, to: alert.phone })
      }
    } catch (error) {
      try {
        if (channel === 'email' && process.env.SENDGRID_API_KEY && process.env.ALERT_FROM_EMAIL && alert.email) await sgMail.send({ to: alert.email, from: process.env.ALERT_FROM_EMAIL, subject, html })
        else throw error
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

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoStatus, lastSyncAt, dataMode: 'demo' }))
app.get('/api/products', (_req, res) => res.json({ products: catalog }))
app.post('/api/products', async (req, res) => {
  const { name, brand, category, sourceUrl } = req.body || {}
  if (!name?.trim() || !brand?.trim() || !category?.trim() || !sourceUrl?.trim()) return res.status(400).json({ error: 'Name, brand, category, and URL are required' })
  try { new URL(sourceUrl) } catch { return res.status(400).json({ error: 'A valid product URL is required' }) }
  const product = generateProduct(name, brand, category, sourceUrl)
  if (catalog.some((item) => item.sku === product.sku)) return res.status(409).json({ error: 'A product with this SKU already exists' })
  catalog.push(product)
  priceSnapshots.set(product.id, createSnapshot(product.id))
  await persistProduct(product)
  return res.status(201).json({ product })
})
app.get('/api/product/specs', (req, res) => res.json(getProduct(req.query.productId)))
app.get('/api/prices', (req, res) => {
  const product = getProduct(req.query.productId)
  const prices = priceSnapshots.get(product.id) || []
  const values = prices.map((entry) => entry.price)
  const average = values.reduce((sum, value) => sum + value, 0) / (values.length || 1)
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length || 1)
  res.json({ updatedAt: lastSyncAt, dataMode: 'demo', prices, stats: { average: Math.round(average), lowest: Math.min(...values), highest: Math.max(...values), volatility: Math.sqrt(variance) } })
})
app.get('/api/prices/history/:color', (req, res) => {
  const rangeDays = { '1W': 7, '1M': 30, '3M': 90 }[req.query.range] || 90
  res.json({ color: req.params.color, range: rangeDays, dataMode: 'demo', history: buildHistory(req.query.productId, req.params.color, rangeDays) })
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
    await PriceModel.deleteMany({ productId })
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
const productToDocument = (product) => ({ productId: product.id, name: product.name, brand: product.brand, category: product.category, sku: product.sku, sourceUrl: product.sourceUrl, description: product.description, specs: product.specs, colors: product.colors, dataMode: product.dataMode })

if (process.env.MONGODB_URI) {
  const connectMongo = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
      mongoStatus = 'connected'
      mongoReady = true
      await Promise.all(catalog.map((product) => persistProduct(product)))
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
