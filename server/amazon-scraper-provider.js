import { chromium } from 'playwright'

const AMAZON_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const AMAZON_VIEWPORT = { width: 1440, height: 900 }
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const randomDelay = () => 2000 + Math.floor(Math.random() * 2001)
const parsePrice = (value) => {
  const numeric = Number(String(value ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

const isCaptchaPage = ({ title, bodyText, url }) => {
  const content = `${title}\n${bodyText}\n${url}`.toLowerCase()
  return [
    'validatecaptcha',
    '/errors/validatecaptcha',
    'enter the characters you see below',
    'sorry, we just need to make sure you\'re not a robot',
    'type the characters',
    'robot check',
  ].some((marker) => content.includes(marker))
}

export const amazonScraperProvider = {
  async fetchPrice(listing) {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent: AMAZON_USER_AGENT,
      viewport: AMAZON_VIEWPORT,
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    })
    const page = await context.newPage()
    try {
      await delay(randomDelay())
      const response = await page.goto(listing.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      const pageState = await page.evaluate(() => ({
        title: document.title,
        bodyText: document.body?.innerText || '',
        url: window.location.href,
        jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((node) => node.textContent).filter(Boolean),
        visiblePrices: [
          '#priceblock_ourprice',
          '#priceblock_dealprice',
          '#corePrice_feature_div .a-offscreen',
          '#apex_desktop .a-offscreen',
          '#price_inside_buybox',
          '.a-price .a-offscreen',
        ].flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((node) => node.textContent?.trim()).filter(Boolean)),
        availability: document.querySelector('#availability, #outOfStock, #buybox-see-all-buying-choices')?.textContent?.trim() || '',
      }))

      if (isCaptchaPage(pageState)) throw new Error('Amazon CAPTCHA/bot-check page detected')
      if (!response || response.status() >= 400) throw new Error(`Amazon page returned HTTP ${response?.status() || 'no response'}`)

      const structured = pageState.jsonLd.flatMap((value) => {
        try {
          const parsed = JSON.parse(value)
          return Array.isArray(parsed) ? parsed : [parsed]
        } catch {
          return []
        }
      })
      const productData = structured.find((item) => item?.['@type'] === 'Product' || item?.offers)
      const offer = Array.isArray(productData?.offers) ? productData.offers[0] : productData?.offers
      const price = parsePrice(offer?.price ?? productData?.price ?? pageState.visiblePrices[0])
      if (!price) throw new Error('Amazon page did not expose a usable price')

      const availability = String(offer?.availability || pageState.availability || '').toLowerCase()
      const stock = /outofstock|out of stock|currently unavailable|unavailable/.test(availability)
        ? 'Out of stock'
        : 'In stock'
      return {
        price,
        stock,
        title: productData?.name || pageState.title,
        url: listing.url,
        source: 'Amazon Playwright scraper',
      }
    } finally {
      await context.close().catch(() => {})
      await browser.close().catch(() => {})
    }
  },
}

