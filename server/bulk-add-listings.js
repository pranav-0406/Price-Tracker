import process from 'node:process'

const apiBase = process.env.API_URL || `http://127.0.0.1:${process.env.PORT || 3001}`
const urls = [
  'https://www.amazon.in/dp/B0CCRZPKR1',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-over-ear-headphones-anc-60h-battery-multipoint-connectivity-bluetooth-wired/p/itm88ea23a271705',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-over-ear-headphones-designed-germany-60-hr-battery-bluetooth/p/itm1b024d614f099',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-designed-germany-adaptive-anc-60-hours-battery-bluetooth/p/itmbb09f7498450e',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-designed-germany-adaptive-anc-60-hours-battery-bluetooth/p/itm8c609112faa10',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-designed-germany-adaptive-anc-60-hours-battery-bluetooth/p/itmd0a98d905bd0c',
  'https://www.flipkart.com/sennheiser-momentum-4-wireless-designed-germany-adaptive-anc-60-hours-battery-bluetooth/p/itmd9820a3227d6e',
  'https://www.croma.com/sennheiser-momentum-4-700383-bluetooth-headphone-with-mic-hybrid-adaptive-anc-over-ear-graphite-/p/316628',
  'https://www.reliancedigital.in/product/sennheiser-momentum-4-bluetooth-headphone-graphite-mrc2qn-10267638',
  'https://www.vijaysales.com/p/P226552/242946/sennheiser-momentum-4-wireless-over-ear-headphones-with-anc-60hrs-battery-customizable-sound-4-digital-mics-for-clear-calls-multipoint-connectivity-lightweight-german-design-graphite',
  'https://www.vijaysales.com/p/P226552/226552/sennheiser-momentum-4-wireless-over-ear-headphones-with-anc-60hrs-battery-customizable-sound-4-digital-mics-for-clear-calls-multipoint-connectivity-lightweight-german-design-black',
  'https://in.sennheiser-hearing.com/products/momentum-4-wireless?variant=40372721123388',
]

const summary = { attempted: urls.length, live: [], unavailable: [], rejected: [], duplicate: [] }
const detectRetailer = (url) => new URL(url).hostname.replace(/^www\./, '').split('.')[0]
for (const url of urls) {
  const detectedRetailer = detectRetailer(url)
  try {
    const response = await fetch(`${apiBase}/api/products`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const body = await response.json()
    const listing = body.listing
    const retailer = listing?.retailerName || listing?.retailer || detectedRetailer
    const result = { url, retailer, dataMode: listing?.dataMode || (response.status === 409 ? 'duplicate' : 'rejected'), reason: body.error || listing?.lastError || null }
    if (response.status === 409) summary.duplicate.push(result)
    else if (!response.ok) summary.rejected.push(result)
    else if (listing?.dataMode === 'live') summary.live.push(result)
    else summary.unavailable.push(result)
    console.log(`${url}\n  retailer=${retailer} status=${response.status} dataMode=${result.dataMode}${result.reason ? ` reason=${result.reason}` : ''}`)
  } catch (error) {
    const result = { url, retailer: 'unknown', dataMode: 'rejected', reason: error.message }
    summary.rejected.push(result)
    console.log(`${url}\n  retailer=unknown status=network-error dataMode=rejected reason=${error.message}`)
  }
}

console.log('\nFinal summary')
console.table({
  attempted: summary.attempted,
  live: summary.live.length,
  unavailable: summary.unavailable.length,
  duplicate: summary.duplicate.length,
  rejected: summary.rejected.length,
})
console.log('Unavailable:', summary.unavailable)
console.log('Rejected:', summary.rejected)
console.log('Already tracked:', summary.duplicate)
