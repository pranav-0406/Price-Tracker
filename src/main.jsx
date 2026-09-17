import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, Bell, BellRing, ChevronDown, ChevronRight, CircleHelp, Clock3, ExternalLink, Filter, Headphones, LayoutDashboard, LineChart as LineChartIcon, Menu, Package, Search, Settings, ShoppingBag, Sparkles, TrendingDown, Truck, X, Zap } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './styles.css'

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`
const retailerColors = { Amazon: '#e58442', Flipkart: '#437ac8', Croma: '#4aa46f', JioMart: '#9279bb', 'Vijay Sales': '#e84646' }
const apiUrl = (path) => `${import.meta.env.VITE_API_URL || ''}${path}`

class ErrorBoundary extends React.Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() { return this.state.hasError ? <div className="error-state"><h2>Something went wrong</h2><button onClick={() => window.location.reload()}>Reload tracker</button></div> : this.props.children }
}

function App() {
  const [products, setProducts] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [product, setProduct] = useState(null)
  const [priceRows, setPriceRows] = useState([])
  const [history, setHistory] = useState([])
  const [alerts, setAlerts] = useState([])
  const [selectedColor, setSelectedColor] = useState('black')
  const [range, setRange] = useState('3M')
  const [sort, setSort] = useState('price-asc')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [colorFilter, setColorFilter] = useState('selected')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [showAlert, setShowAlert] = useState(false)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', brand: '', category: 'Headphones', sourceUrl: '' })
  const [alertForm, setAlertForm] = useState({ alertType: 'price_drop', condition: '24000', notify: 'email', email: '', phone: '' })
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [dataMode, setDataMode] = useState('demo')
  const [error, setError] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')
  const [imageFailed, setImageFailed] = useState(false)

  const loadData = useCallback(async () => {
    if (!selectedProductId) return
    setLoading(true); setError('')
    try {
      const [specsRes, pricesRes] = await Promise.all([fetch(apiUrl(`/api/product/specs?productId=${selectedProductId}`)), fetch(apiUrl(`/api/prices?productId=${selectedProductId}`))])
      if (!specsRes.ok || !pricesRes.ok) throw new Error('Tracker data could not be loaded')
      const specs = await specsRes.json(); const prices = await pricesRes.json()
      setProduct(specs); setPriceRows(prices.prices || []); setLastSync(prices.updatedAt); setDataMode(prices.dataMode || 'demo')
      setImageFailed(false)
      setSelectedColor((current) => specs.colors?.some((color) => color.value === current) ? current : (specs.colors?.[0]?.value || 'black'))
    } catch (loadError) { setError(loadError.message) } finally { setLoading(false) }
  }, [selectedProductId])

  useEffect(() => {
    fetch(apiUrl('/api/products')).then((res) => res.json()).then((data) => { setProducts(data.products || []); if (!selectedProductId) setSelectedProductId(data.products?.[0]?.id || '') }).catch(() => setError('Unable to load products'))
  }, [selectedProductId])
  useEffect(() => { loadData(); const timer = window.setInterval(loadData, 300000); return () => window.clearInterval(timer) }, [loadData])
  useEffect(() => {
    if (!selectedProductId) return
    fetch(apiUrl(`/api/prices/history/${selectedColor}?productId=${selectedProductId}&range=${range}`)).then((res) => res.json()).then((data) => setHistory(data.history || [])).catch(() => setHistory([]))
  }, [selectedColor, selectedProductId, range])
  const loadAlerts = useCallback(() => fetch(apiUrl('/api/alerts/guest')).then((res) => res.json()).then((data) => setAlerts(data.alerts || [])).catch(() => {}), [])
  useEffect(() => { loadAlerts() }, [loadAlerts])
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') { setShowAlert(false); setShowAddProduct(false) } }
    document.addEventListener('keydown', closeOnEscape); return () => document.removeEventListener('keydown', closeOnEscape)
  }, [])

  const activeColor = product?.colors?.find((entry) => entry.value === selectedColor) || product?.colors?.[0]
  const filteredRows = useMemo(() => priceRows.filter((item) => colorFilter === 'selected' ? item.colorValue === selectedColor : colorFilter === 'all' || item.colorValue === colorFilter).filter((item) => platformFilter === 'all' || item.platform === platformFilter).filter((item) => !minPrice || item.price >= Number(minPrice)).filter((item) => !maxPrice || item.price <= Number(maxPrice)).sort((a, b) => sort === 'price-desc' ? b.price - a.price : sort === 'platform' ? a.platform.localeCompare(b.platform) : sort === 'color' ? a.color.localeCompare(b.color) : a.price - b.price), [priceRows, selectedColor, platformFilter, colorFilter, minPrice, maxPrice, sort])
  const stats = useMemo(() => { const values = filteredRows.map((entry) => entry.price); if (!values.length) return null; const average = values.reduce((sum, value) => sum + value, 0) / values.length; const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length; return { average, min: Math.min(...values), max: Math.max(...values), volatility: Math.sqrt(variance) } }, [filteredRows])
  const historicalLow = useMemo(() => {
    const values = history.flatMap((row) => Object.values(row).filter((value) => typeof value === 'number'))
    return values.length ? Math.min(...values) : null
  }, [history])
  const tableColorLabel = colorFilter === 'all' ? 'all colors' : colorFilter === 'selected' ? `${activeColor?.name || 'selected'} variant` : `${product?.colors?.find((color) => color.value === colorFilter)?.name || colorFilter} variant`
  const priceIsVerified = dataMode === 'live' && filteredRows.every((item) => item.verified)
  const navigateTo = (section) => {
    setActiveSection(section)
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMobileNav(false)
  }

  const saveAlert = async (event) => {
    event.preventDefault()
    const response = await fetch(apiUrl('/api/alerts'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...alertForm, productId: selectedProductId, color: selectedColor }) })
    const data = await response.json()
    if (!response.ok) return setError(data.error || 'Could not create alert')
    setAlerts((current) => [data.alert, ...current]); setShowAlert(false)
  }
  const addNewProduct = async (event) => {
    event.preventDefault()
    const response = await fetch(apiUrl('/api/products'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newProduct) })
    const data = await response.json()
    if (!response.ok) return setError(data.error || 'Could not add product')
    setProducts((current) => [...current, data.product]); setSelectedProductId(data.product.id); setShowAddProduct(false); setNewProduct({ name: '', brand: '', category: 'Headphones', sourceUrl: '' })
  }
  const updateAlert = async (alert, status) => { await fetch(apiUrl(`/api/alerts/${alert.id}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); loadAlerts() }
  const deleteAlert = async (alert) => { await fetch(apiUrl(`/api/alerts/${alert.id}`), { method: 'DELETE' }); setAlerts((current) => current.filter((item) => item.id !== alert.id)) }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}><div className="brand"><span className="brand-mark"><Headphones size={18} /></span><span>track<span className="brand-dot">.</span>audio</span></div><div className="workspace-label">YOUR WORKSPACE</div>    <nav><button className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`} onClick={() => navigateTo('overview')}><LayoutDashboard size={18} /> Overview</button><button className={`nav-item ${activeSection === 'history' ? 'active' : ''}`} onClick={() => navigateTo('history')}><LineChartIcon size={18} /> Price history</button><button className={`nav-item ${activeSection === 'alerts' ? 'active' : ''}`} onClick={() => navigateTo('alerts')}><Bell size={18} /> My alerts <span className="nav-count">{alerts.length}</span></button><button className={`nav-item ${activeSection === 'retailers' ? 'active' : ''}`} onClick={() => navigateTo('retailers')}><ShoppingBag size={18} /> Retailers</button></nav><div className="sidebar-divider" /><div className="workspace-label">TRACKED PRODUCTS</div><div className="product-list">{products.map((item) => <button key={item.id} className={`product-link ${selectedProductId === item.id ? 'selected' : ''}`} onClick={() => { setSelectedProductId(item.id); setMobileNav(false) }}><span className="mini-product"><Headphones size={14} /></span><span><b>{item.name}</b><small>{item.brand}</small></span></button>)}</div><button className="add-product" onClick={() => setShowAddProduct(true)}><span>+</span> Add product</button><div className="sidebar-bottom"><div className="sync-card"><div className="sync-title"><span className="live-dot" /> Auto-refresh every 5 min</div><small>{dataMode === 'demo' ? 'Demo data · scraper not connected' : 'Live retailer data'}</small></div>    <button className="nav-item" onClick={() => setError('Settings are configured through the .env file.')}><Settings size={18} /> Settings</button><button className="nav-item" onClick={() => setError('See README.md for setup and API verification steps.')}><CircleHelp size={18} /> Help center</button><div className="profile"><div className="avatar">PS</div><div><b>Pranav S.</b><small>Free plan</small></div><ChevronDown size={14} /></div></div></aside>
    {mobileNav && <div className="mobile-backdrop" onClick={() => setMobileNav(false)} />}
    <main className="main-content"><header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={21} /></button><div className="breadcrumbs"><span>Products</span><ChevronRight size={14} /><b>{product?.name || 'Price tracker'}</b></div><div className="topbar-actions"><div className="search"><Search size={16} /><span>Search products</span></div><button className="icon-button" onClick={() => setShowAlert(true)}><BellRing size={18} /></button><button className="avatar top-avatar">PS</button></div></header>
      <div id="overview" className="content">{error && <div className="error-banner">{error}<button onClick={() => setError('')}><X size={14} /></button></div>}<section className="product-heading"><div className="heading-main"><div className="product-art">{imageFailed || !product?.image ? <Headphones size={56} /> : <img src={product.image} alt={`${product.name} product`} onError={() => setImageFailed(true)} />}</div><div><div className="eyebrow"><span className="live-dot" /> {dataMode === 'demo' ? 'DEMO DATA' : 'LIVE TRACKING'}</div><h1>{product?.name || 'Loading tracker…'}</h1><p>{product?.description}</p><div className="tag-row"><span className="tag">SKU: {product?.sku || '—'}</span><span className="updated"><Clock3 size={13} /> {loading ? 'Refreshing…' : lastSync ? `Updated ${new Date(lastSync).toLocaleTimeString()}` : 'Waiting for sync'}</span></div></div></div><button className="alert-button" onClick={() => setShowAlert(true)}><Bell size={17} /> Set price alert</button></section>
        <section className="color-section card"><div className="section-header"><div><h2>Choose a color</h2><p>Compare prices and availability for each variant</p></div><button className="filter-button" onClick={() => document.querySelector('.price-card')?.scrollIntoView({ behavior: 'smooth' })}><Filter size={15} /> Filters</button></div><div className="color-list">{product?.colors?.map((color) => <button key={color.value} className={`color-option ${selectedColor === color.value ? 'selected' : ''}`} onClick={() => setSelectedColor(color.value)}><span className="color-thumb" style={{ backgroundImage: `url(${color.image || product.image})` }} /><span className="color-info"><b>{color.name}</b><small><span className="stock-dot" /> {color.stock}</small></span><strong>{dataMode === 'demo' ? 'Demo estimate' : money(color.price)}</strong></button>)}</div></section>
        <div className="dashboard-grid"><section id="history" className="card chart-card"><div className="section-header"><div><h2>Price history</h2><p>{activeColor?.name || 'Selected color'} · {range === '1W' ? 'Last 7 days' : range === '1M' ? 'Last 30 days' : 'Last 90 days'}</p></div><div className="range-tabs">{['1W', '1M', '3M'].map((item) => <button key={item} className={range === item ? 'selected' : ''} onClick={() => setRange(item)}>{item}</button>)}</div></div>{dataMode === 'demo' ? <div className="no-history">Verified history will appear after live retailer sources are connected.</div> : <><div className="chart-legend">{Object.keys(retailerColors).map((name) => <span key={name}><i className="legend-line" style={{ background: retailerColors[name] }} /> {name}</span>)}</div><div className="chart-wrap"><ResponsiveContainer width="100%" height={245}><AreaChart data={history}><CartesianGrid stroke="#e8e8e2" vertical={false} /><XAxis dataKey="date" hide={history.length > 30} /><YAxis domain={['auto', 'auto']} tickFormatter={(value) => `₹${Math.round(value / 1000)}k`} /><Tooltip formatter={(value) => money(value)} /><Area type="monotone" dataKey="Amazon" stroke={retailerColors.Amazon} fill="#e5844220" strokeWidth={2.5} /><Area type="monotone" dataKey="Flipkart" stroke={retailerColors.Flipkart} fill="none" /><Area type="monotone" dataKey="Croma" stroke={retailerColors.Croma} fill="none" /><Area type="monotone" dataKey="JioMart" stroke={retailerColors.JioMart} fill="none" /><Area type="monotone" dataKey="Vijay Sales" stroke={retailerColors['Vijay Sales']} fill="none" /></AreaChart></ResponsiveContainer></div></>}<div className="chart-footer"><span><TrendingDown size={15} /> <b>Historical low:</b> {historicalLow ? money(historicalLow) : 'Not available'}</span></div></section>
          <section className="card stats-card"><div className="section-header"><div><h2>Market snapshot</h2><p>Across {new Set(priceRows.map((item) => item.platform)).size} retailers</p></div><Activity size={19} className="muted-icon" /></div><div className="stats-list"><div><span>{priceIsVerified ? 'Average price' : 'Average estimate'}</span><strong>{stats ? money(stats.average) : '—'}</strong></div><div><span>{priceIsVerified ? 'Lowest price' : 'Lowest estimate'}</span><strong className="green">{stats ? money(stats.min) : '—'} <small>{filteredRows.find((item) => item.price === stats?.min)?.platform || ''}</small></strong></div><div><span>{priceIsVerified ? 'Highest price' : 'Highest estimate'}</span><strong>{stats ? money(stats.max) : '—'}</strong></div><div><span>{priceIsVerified ? 'Price volatility' : 'Estimate variance'}</span><strong>{stats ? money(stats.volatility) : '—'}</strong></div></div><div className="buy-tip"><Sparkles size={16} /><span><b>{dataMode === 'demo' ? 'Prices not verified' : 'Good time to buy'}</b><small>{dataMode === 'demo' ? 'These are demo estimates, not live retailer prices.' : 'Prices are verified from marketplace sources.'}</small></span></div></section></div>
        <section id="retailers" className="card price-card"><div className="section-header"><div><h2>Where to buy</h2><p>{priceIsVerified ? 'Current verified prices' : 'Demo estimates — not live prices'} for <b>{tableColorLabel}</b></p></div><div className="sort-control"><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="platform">Platform</option><option value="color">Color</option></select></div></div><div className="table-filters"><select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">All platforms</option>{Object.keys(retailerColors).map((name) => <option key={name}>{name}</option>)}</select><select value={colorFilter} onChange={(event) => setColorFilter(event.target.value)}><option value="selected">Selected color</option><option value="all">All colors</option>{product?.colors?.map((color) => <option key={color.value} value={color.value}>{color.name}</option>)}</select><input type="number" min="0" placeholder="Min ₹" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /><input type="number" min="0" placeholder="Max ₹" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></div><div className="price-table"><div className="table-row table-head"><span>RETAILER</span><span>PRICE</span><span>CHANGE</span><span>AVAILABILITY</span><span>DELIVERY</span><span /></div>{filteredRows.map((item, index) => <div className={`table-row ${index === 0 ? 'best-row' : ''}`} key={`${item.platform}-${item.colorValue}`}><span className="retailer"><span className="retailer-logo" style={{ background: item.colorHex }}>{item.short}</span><b>{item.platform}</b>{index === 0 && <span className="best-badge">BEST PRICE</span>}{item.cardOffer && <span className="offer-badge">Card offer</span>}</span>        <span className="price-value">{priceIsVerified ? money(item.price) : 'Not verified'}<small>{priceIsVerified ? `was ${money(item.previous)}` : 'Live source required'}</small></span><span className={item.change < 0 ? 'green change' : 'change muted'}>{item.change < 0 ? <TrendingDown size={14} /> : '—'}{item.change < 0 && `${Math.abs(item.change)}%`}</span><span className="availability"><i />{item.stock}</span><span className="delivery"><Truck size={14} />{item.delivery}</span><a className="buy-link" href={item.url} target="_blank" rel="noreferrer">Visit <ExternalLink size={13} /></a></div>)}</div></section>
        <section className="bottom-grid"><div className="card specs-card"><div className="section-header"><div><h2>About this product</h2><p>What you should know</p></div><Package size={19} className="muted-icon" /></div><div className="specs">{Object.entries(product?.specs || {}).map(([key, value]) => <div key={key}><span>{key}</span><b>{value}</b></div>)}</div><p className="description">{product?.description}</p></div>        <div id="alerts" className="card alerts-card"><div className="section-header"><div><h2>Your alerts</h2><p>Delivery status included</p></div><Bell size={18} className="muted-icon" /></div>{alerts.filter((item) => item.productId === selectedProductId).slice(0, 3).map((alert) => <div className="alert-row" key={alert.id}><span className="alert-symbol"><TrendingDown size={16} /></span><span><b>{alert.alertType.replaceAll('_', ' ')}</b><small>{alert.status} · {alert.delivery?.status || 'pending'}</small></span><button className={`toggle ${alert.status === 'active' ? 'on' : ''}`} onClick={() => updateAlert(alert, alert.status === 'active' ? 'inactive' : 'active')} aria-label="Toggle alert" /><button className="icon-button" onClick={() => deleteAlert(alert)} aria-label="Delete alert"><X size={15} /></button></div>)}<div className="alert-actions"><select value={alertForm.notify} onChange={(event) => setAlertForm({ ...alertForm, notify: event.target.value })}><option value="email">Email</option><option value="sms">SMS</option><option value="both">Email + SMS</option></select><button className="manage-alerts" onClick={() => setShowAlert(true)}>Manage alerts <ChevronRight size={14} /></button></div></div></section>
        <footer><span><span className="live-dot" /> Tracking {new Set(priceRows.map((item) => item.platform)).size} retailers · Auto-refreshes every 5 min</span><span>Data mode: {dataMode}</span></footer>
      </div></main>
    {showAddProduct && <div className="modal-backdrop" onClick={() => setShowAddProduct(false)}><div className="modal small" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowAddProduct(false)}><X size={18} /></button><h2>Add a product</h2><form onSubmit={addNewProduct} className="add-product-form">{[['name', 'Product name'], ['brand', 'Brand'], ['category', 'Category'], ['sourceUrl', 'Product URL']].map(([key, label]) => <label key={key}>{label}<input required value={newProduct[key]} type={key === 'sourceUrl' ? 'url' : 'text'} onChange={(event) => setNewProduct({ ...newProduct, [key]: event.target.value })} /></label>)}<button type="submit" className="save-alert">Save product</button></form></div></div>}
    {showAlert && <div className="modal-backdrop" onClick={() => setShowAlert(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowAlert(false)}><X size={18} /></button><span className="modal-icon"><BellRing size={20} /></span><h2>Set an alert</h2><form onSubmit={saveAlert}><label>Alert type<select value={alertForm.alertType} onChange={(event) => setAlertForm({ ...alertForm, alertType: event.target.value })}><option value="price_drop">Price drop</option><option value="cheaper_retailer">Cheaper retailer</option><option value="back_in_stock">Back in stock</option><option value="card_offer">Card offer</option></select></label>{alertForm.alertType === 'price_drop' && <label>Target price<input required type="number" min="1" value={alertForm.condition} onChange={(event) => setAlertForm({ ...alertForm, condition: event.target.value })} /></label>}<label>Notification<select value={alertForm.notify} onChange={(event) => setAlertForm({ ...alertForm, notify: event.target.value })}><option value="email">Email</option><option value="sms">SMS</option><option value="both">Email + SMS</option></select></label>{(alertForm.notify === 'email' || alertForm.notify === 'both') && <label>Email<input required type="email" value={alertForm.email} onChange={(event) => setAlertForm({ ...alertForm, email: event.target.value })} /></label>}{(alertForm.notify === 'sms' || alertForm.notify === 'both') && <label>Phone<input required type="tel" value={alertForm.phone} onChange={(event) => setAlertForm({ ...alertForm, phone: event.target.value })} /></label>}<button className="save-alert">Create alert</button></form></div></div>}
  </div>
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>)
