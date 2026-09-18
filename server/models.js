import mongoose from 'mongoose'

const colorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  value: { type: String, required: true },
  colorHex: String,
  image: String,
  price: Number,
  stock: String,
}, { _id: false })

export const ProductModel = mongoose.models.Product || mongoose.model('Product', new mongoose.Schema({
  productId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  brand: { type: String, required: true },
  category: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  sourceUrl: String,
  description: String,
  specs: mongoose.Schema.Types.Mixed,
  colors: [colorSchema],
  dataMode: { type: String, enum: ['demo', 'live', 'partial', 'unavailable'], default: 'demo' },
}, { timestamps: true }))

export const PriceModel = mongoose.models.Price || mongoose.model('Price', new mongoose.Schema({
  productId: { type: String, required: true, index: true },
  platform: { type: String, required: true },
  colorValue: { type: String, required: true },
  color: String,
  price: Number,
  previous: Number,
  change: Number,
  stock: String,
  delivery: String,
  url: String,
  cardOffer: Boolean,
  verified: Boolean,
  dataMode: String,
  lastUpdated: Date,
}, { timestamps: true }))

export const ListingModel = mongoose.models.Listing || mongoose.model('Listing', new mongoose.Schema({
  productId: { type: String, required: true, index: true },
  retailer: { type: String, enum: ['amazon', 'flipkart', 'croma', 'reliance_digital', 'vijay_sales', 'sennheiser_official'], required: true },
  url: { type: String, required: true },
  variant: { type: String, default: 'unknown' },
  asin: String,
  active: { type: Boolean, default: true },
  lastPrice: Number,
  lastStock: String,
  lastCheckedAt: Date,
  lastSuccessAt: Date,
  dataMode: { type: String, enum: ['live', 'unavailable'], default: 'unavailable' },
  verified: { type: Boolean, default: false },
  apiVerified: { type: Boolean, default: false },
  consecutiveFailures: { type: Number, default: 0 },
  lastError: String,
}, { timestamps: true }))
ListingModel.schema.index({ productId: 1, url: 1 }, { unique: true })

export const PriceHistoryModel = mongoose.models.PriceHistory || mongoose.model('PriceHistory', new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, index: true },
  productId: { type: String, required: true, index: true },
  retailer: String,
  variant: String,
  price: { type: Number, required: true },
  stock: String,
  url: String,
  fetchedAt: { type: Date, required: true, index: true },
  verified: { type: Boolean, default: true },
}, { timestamps: true }))

export const PriceObservationModel = mongoose.models.PriceObservation || mongoose.model('PriceObservation', new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', index: true },
  productId: { type: String, required: true, index: true },
  retailer: { type: String, required: true, index: true },
  status: { type: String, required: true, enum: ['ok', 'out_of_stock', 'price_not_found', 'not_listed', 'blocked', 'fetch_error', 'timeout'] },
  price: { type: Number, default: null },
  mrp: { type: Number, default: null },
  currency: { type: String, default: 'INR' },
  availability: { type: String, default: 'unknown' },
  method: String,
  message: String,
  observedAt: { type: Date, required: true, index: true },
}, { timestamps: true }))
PriceObservationModel.schema.index({ productId: 1, retailer: 1, observedAt: -1 })

export const CurrentPriceModel = mongoose.models.CurrentPrice || mongoose.model('CurrentPrice', new mongoose.Schema({
  listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', unique: true, sparse: true },
  productId: { type: String, required: true, index: true },
  retailer: { type: String, required: true },
  url: String,
  price: { type: Number, default: null },
  mrp: { type: Number, default: null },
  availability: { type: String, default: 'unknown' },
  lastSuccessAt: Date,
  lastAttemptAt: { type: Date, required: true },
  lastStatus: { type: String, required: true },
  lastMessage: String,
  consecutiveFailures: { type: Number, default: 0 },
}, { timestamps: true }))
CurrentPriceModel.schema.index({ productId: 1, retailer: 1 }, { unique: true })

export const AlertModel = mongoose.models.Alert || mongoose.model('Alert', new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  productId: { type: String, required: true, index: true },
  color: String,
  platform: String,
  alertType: String,
  condition: mongoose.Schema.Types.Mixed,
  notify: String,
  email: String,
  phone: String,
  status: String,
  delivery: mongoose.Schema.Types.Mixed,
  lastEventHash: String,
}, { timestamps: true }))
