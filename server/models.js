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
  dataMode: { type: String, enum: ['demo', 'live'], default: 'demo' },
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
  retailer: { type: String, enum: ['amazon', 'flipkart', 'croma', 'reliance_digital', 'vijay_sales'], required: true },
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
  consecutiveFailures: { type: Number, default: 0 },
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
