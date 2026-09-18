import dotenv from 'dotenv'
import { amazonScraperProvider } from './amazon-scraper-provider.js'

dotenv.config()

const listing = { url: process.argv[2] || 'https://www.amazon.in/dp/B0CCRZPKR1' }
const startedAt = Date.now()

try {
  const result = await amazonScraperProvider.fetchPrice(listing)
  console.log(JSON.stringify({ status: 'success', elapsedMs: Date.now() - startedAt, result }, null, 2))
} catch (error) {
  console.error(JSON.stringify({ status: 'failure', elapsedMs: Date.now() - startedAt, error: error.message }, null, 2))
  process.exitCode = 1
}
