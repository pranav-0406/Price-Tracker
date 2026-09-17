import process from 'node:process'

const apiUrl = process.env.FLIPKART_API_URL || 'https://affiliate-api.flipkart.net/affiliate/product/json'
const affiliateId = process.env.FLIPKART_AFFILIATE_ID
const affiliateToken = process.env.FLIPKART_AFFILIATE_TOKEN
if (!affiliateId || !affiliateToken) throw new Error('Set FLIPKART_AFFILIATE_ID and FLIPKART_AFFILIATE_TOKEN in .env before running this test')

const urls = [
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-over-ear-headphones-anc-60h-battery-multipoint-connectivity-bluetooth-wired/p/itm88ea23a271705',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-over-ear-headphones-designed-germany-60-hr-battery-bluetooth/p/itm1b024d614f099',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-designed-germany-adaptive-anc-60-hours-battery-bluetooth/p/itmbb09f7498450',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-designed-germany-adaptive-anc-60-hours-battery-bluetooth/p/itm8c609112faa10',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-designed-germany-adaptive-anc-60-hours-battery-bluetooth/p/itmd0a98d905bd0c',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-designed-germany-adaptive-anc-60-hours-battery-bluetooth/p/itmd9820a3227d6e',
]
const extractId = (url) => new URL(url).pathname.match(/\/p\/(itm[a-z0-9]+)/i)?.[1] || null
const findValue = (value, keys) => {
  if (!value || typeof value !== 'object') return null
  for (const key of keys) if (value[key] !== undefined && value[key] !== null) return value[key]
  for (const child of Object.values(value)) { const result = findValue(child, keys); if (result !== null) return result }
  return null
}
const normalize = (value) => typeof value === 'string' ? value.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase() : ''
const results = []
for (const savedUrl of urls) {
  const id = extractId(savedUrl)
  let result = { savedUrl, extractedId: id, status: null, returnedProductId: null, canonicalUrl: null, price: null, stock: null, variant: null, seller: null, verdict: 'NO_RESULT', reason: null }
  try {
    if (!id) throw new Error('No itm identifier found')
    const response = await fetch(`${apiUrl}?id=${encodeURIComponent(id)}`, { headers: { 'Fk-Affiliate-Id': affiliateId, 'Fk-Affiliate-Token': affiliateToken, accept: 'application/json' } })
    result.status = response.status
    if (!response.ok) throw new Error(`Affiliate API returned HTTP ${response.status}`)
    const payload = await response.json()
    const product = payload.productInfo || payload.product || payload.products?.[0] || payload
    result.returnedProductId = findValue(product, ['productId', 'productID', 'fsn', 'id'])
    result.canonicalUrl = findValue(product, ['productUrl', 'productURL', 'url', 'canonicalUrl'])
    result.price = findValue(product, ['sellingPrice', 'selling_price', 'price'])
    result.stock = findValue(product, ['inStock', 'in_stock', 'availability', 'stock'])
    result.variant = findValue(product, ['color', 'colour', 'variant'])
    result.seller = findValue(product, ['seller', 'sellerName', 'seller_name', 'offer'])
    const sameId = String(result.returnedProductId || '').toLowerCase() === id.toLowerCase()
    const sameUrl = normalize(result.canonicalUrl) === normalize(savedUrl)
    result.verdict = sameId || sameUrl ? 'MATCH' : (result.returnedProductId || result.canonicalUrl ? 'MISMATCH' : 'NO_RESULT')
    if (!sameId && !sameUrl) result.reason = 'Returned product identity or canonical URL does not match saved listing'
  } catch (error) { result.reason = error.message }
  results.push(result)
  console.log(result)
}
console.log(`\nOverall: ${results.filter((item) => item.verdict === 'MATCH').length} of ${results.length} matched cleanly`)
console.table(results.map(({ savedUrl, extractedId, status, returnedProductId, canonicalUrl, price, stock, variant, seller, verdict, reason }) => ({ savedUrl, extractedId, status, returnedProductId, canonicalUrl, price, stock, variant, seller, verdict, reason })))
