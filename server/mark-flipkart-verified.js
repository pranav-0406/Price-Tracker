import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { ListingModel } from './models.js'

dotenv.config()
const urls = process.argv.slice(2)
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required')
if (!urls.length) throw new Error('Pass one or more exact matched Flipkart listing URLs')
await mongoose.connect(process.env.MONGODB_URI)
const result = await ListingModel.updateMany({ retailer: 'flipkart', url: { $in: urls } }, { $set: { apiVerified: true, lastError: null, dataMode: 'unavailable', verified: false } })
console.log(`Marked ${result.modifiedCount} Flipkart listing(s) apiVerified=true`)
await mongoose.disconnect()
