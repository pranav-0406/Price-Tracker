import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { ListingModel, ProductModel } from './models.js'

dotenv.config()

const productId = 'sennheiser-momentum-4-wireless'
const amazonUrl = 'https://www.amazon.in/dp/B0CCRZPKR1'

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required to seed listings')

await mongoose.connect(process.env.MONGODB_URI)
const product = await ProductModel.findOne({ productId })
if (!product) throw new Error(`Product ${productId} was not found. Start the API once before seeding.`)

await ListingModel.updateOne(
  { productId, url: amazonUrl },
  { $setOnInsert: { productId, retailer: 'amazon', url: amazonUrl, asin: 'B0CCRZPKR1', variant: 'unknown', active: true, dataMode: 'unavailable', verified: false, consecutiveFailures: 0 } },
  { upsert: true },
)

console.log(`Seeded Amazon listing for ${product.name}: ${amazonUrl}`)
await mongoose.disconnect()
