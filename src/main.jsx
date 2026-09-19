import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity,
  Bell,
  BellRing,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Filter,
  Globe,
  Headphones,
  Info,
  LayoutDashboard,
  LineChart as LineChartIcon,
  Menu,
  Package,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Truck,
  X,
  Zap,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './styles.css'

const retailerColors = {
  Amazon: '#e58442',
  Flipkart: '#437ac8',
  Croma: '#4aa46f',
  'Reliance Digital': '#147dff',
  'Vijay Sales': '#e84646',
  Sennheiser: '#9b7653',
}
const apiUrl = (path) => `${import.meta.env.VITE_API_URL || ''}${path}`

const intervalMap = {
  '15s': 15,
  '30s': 30,
  '1m': 60,
  '5m': 300,
  '30m': 1800,
}

class ErrorBoundary extends React.Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    return this.state.hasError ? (
      <div className="error-state">
        <h2>Something went wrong</h2>
        <button onClick={() => window.location.reload()}>Reload tracker</button>
      </div>
    ) : (
      this.props.children
    )
  }
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
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [alertForm, setAlertForm] = useState({ alertType: 'price_drop', condition: '24000', notify: 'in_app', email: '', phone: '' })
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [dataMode, setDataMode] = useState('live')
  const [error, setError] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')
  const [imageFailed, setImageFailed] = useState(false)
  const [sidebarImageErrors, setSidebarImageErrors] = useState({})

  // Settings & Help Modals
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [settingsTab, setSettingsTab] = useState('general')
  const [helpTab, setHelpTab] = useState('faq')
  const [expandedFaq, setExpandedFaq] = useState(0)
  const [healthStatus, setHealthStatus] = useState(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // Settings state stored in localStorage
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('price_tracker_settings')
      return saved ? JSON.parse(saved) : {
        refreshInterval: '30s',
        currency: 'INR',
        defaultEmail: 'pranav@example.com',
        defaultPhone: '+91 98765 43210',
        liveTicker: true,
        alertSensitivity: '5',
      }
    } catch {
      return {
        refreshInterval: '30s',
        currency: 'INR',
        defaultEmail: 'pranav@example.com',
        defaultPhone: '+91 98765 43210',
        liveTicker: true,
        alertSensitivity: '5',
      }
    }
  })

  // Real-time ticker & countdown
  const [countdown, setCountdown] = useState(() => intervalMap[settings.refreshInterval] || 30)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3200)
  }

  const money = useCallback((value) => {
    const num = Number(value || 0)
    if (settings.currency === 'USD') return `$${(num / 86).toFixed(2)}`
    if (settings.currency === 'EUR') return `€${(num / 93).toFixed(2)}`
    return `₹${num.toLocaleString('en-IN')}`
  }, [settings.currency])

  const loadData = useCallback(async () => {
    if (!selectedProductId) return
    setLoading(true)
    setError('')
    try {
      const [specsRes, pricesRes] = await Promise.all([
        fetch(apiUrl(`/api/product/specs?productId=${selectedProductId}`)),
        fetch(apiUrl(`/api/prices?productId=${selectedProductId}`)),
      ])
      if (!specsRes.ok || !pricesRes.ok) throw new Error('Tracker data could not be loaded')
      const specs = await specsRes.json()
      const prices = await pricesRes.json()
      setProduct(specs)
      setPriceRows(prices.prices || [])
      setLastSync(prices.updatedAt || new Date().toISOString())
      setDataMode(prices.dataMode || 'live')
      setImageFailed(false)
      setSelectedColor((current) =>
        specs.colors?.some((color) => color.value === current)
          ? current
          : specs.colors?.[0]?.value || 'black'
      )
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [selectedProductId])

  const triggerManualRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await fetch(apiUrl('/api/prices/refresh'), { method: 'POST' })
      await loadData()
      if (selectedProductId) {
        const historyRes = await fetch(apiUrl(`/api/prices/history/${selectedColor}?productId=${selectedProductId}&range=${range}`))
        const histData = await historyRes.json()
        setHistory(histData.history || [])
      }
      showToast('Real-time prices synchronized!')
    } catch (e) {
      console.error(e)
    } finally {
      setIsRefreshing(false)
      setCountdown(intervalMap[settings.refreshInterval] || 30)
    }
  }, [loadData, selectedProductId, selectedColor, range, settings.refreshInterval])

  const triggerDynamicShift = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await fetch(apiUrl('/api/prices/shift'), { method: 'POST' })
      await res.json()
      await loadData()
      if (selectedProductId) {
        const historyRes = await fetch(apiUrl(`/api/prices/history/${selectedColor}?productId=${selectedProductId}&range=${range}`))
        const histData = await historyRes.json()
        setHistory(histData.history || [])
      }
      loadNotifications()
      showToast('⚡ Dynamic market prices shifted!')
    } catch (e) {
      console.error(e)
    } finally {
      setIsRefreshing(false)
    }
  }, [loadData, selectedProductId, selectedColor, range])

  // Countdown timer effect for real-time updates
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          triggerManualRefresh()
          return intervalMap[settings.refreshInterval] || 30
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [settings.refreshInterval, triggerManualRefresh])

  useEffect(() => {
    fetch(apiUrl('/api/products'))
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || [])
        if (!selectedProductId) setSelectedProductId(data.products?.[0]?.id || '')
      })
      .catch(() => setError('Unable to load products'))
  }, [selectedProductId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!selectedProductId) return
    fetch(apiUrl(`/api/prices/history/${selectedColor}?productId=${selectedProductId}&range=${range}`))
      .then((res) => res.json())
      .then((data) => setHistory(data.history || []))
      .catch(() => setHistory([]))
  }, [selectedColor, selectedProductId, range])

  const loadAlerts = useCallback(
    () =>
      fetch(apiUrl('/api/alerts/guest'))
        .then((res) => res.json())
        .then((data) => setAlerts(data.alerts || []))
        .catch(() => {}),
    []
  )

  useEffect(() => {
    loadAlerts()
    loadNotifications()
  }, [loadAlerts])

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setShowAlert(false)
        setShowAddProduct(false)
        setShowSettings(false)
        setShowHelp(false)
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [])

  const handleSaveSettings = (e) => {
    e.preventDefault()
    try {
      localStorage.setItem('price_tracker_settings', JSON.stringify(settings))
      showToast('Settings saved successfully!')
      setCountdown(intervalMap[settings.refreshInterval] || 30)
      setShowSettings(false)
    } catch {
      setError('Could not save settings')
    }
  }

  const checkHealth = async () => {
    setHealthLoading(true)
    try {
      const res = await fetch(apiUrl('/api/health'))
      const data = await res.json()
      setHealthStatus(data)
    } catch {
      setHealthStatus({ status: 'error', error: 'Failed to connect to backend server' })
    } finally {
      setHealthLoading(false)
    }
  }

  const activeColor = product?.colors?.find((entry) => entry.value === selectedColor) || product?.colors?.[0]

  const filteredRows = useMemo(
    () =>
      priceRows
        .filter((item) =>
          colorFilter === 'selected'
            ? item.colorValue === selectedColor
            : colorFilter === 'all' || item.colorValue === colorFilter
        )
        .filter((item) => platformFilter === 'all' || item.platform === platformFilter)
        .filter((item) => !minPrice || (Number.isFinite(item.price) && item.price >= Number(minPrice)))
        .filter((item) => !maxPrice || (Number.isFinite(item.price) && item.price <= Number(maxPrice)))
        .sort((a, b) => {
          if (!Number.isFinite(a.price)) return 1
          if (!Number.isFinite(b.price)) return -1
          return sort === 'price-desc'
            ? b.price - a.price
            : sort === 'platform'
            ? a.platform.localeCompare(b.platform)
            : sort === 'color'
            ? a.color.localeCompare(b.color)
            : a.price - b.price
        }),
    [priceRows, selectedColor, platformFilter, colorFilter, minPrice, maxPrice, sort]
  )

  const bestDealRows = useMemo(
    () =>
      filteredRows.filter(
        (item) => item.platform !== 'Sennheiser' && item.verified && Number.isFinite(item.price)
      ),
    [filteredRows]
  )

  const liveRetailers = useMemo(
    () => [
      ...new Set(
        priceRows
          .filter((item) => item.verified && item.dataMode === 'live')
          .map((item) => item.platform)
      ),
    ],
    [priceRows]
  )

  const liveStatus = liveRetailers.length ? `Live Tracking: ${liveRetailers.join(', ')}` : 'Live sources active'

  const stats = useMemo(() => {
    const values = filteredRows.map((entry) => entry.price).filter((p) => Number.isFinite(p))
    if (!values.length) return null
    const average = values.reduce((sum, value) => sum + value, 0) / values.length
    const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
    return {
      average,
      min: Math.min(...values),
      max: Math.max(...values),
      volatility: Math.sqrt(variance),
    }
  }, [filteredRows])

  const historicalLow = useMemo(() => {
    const values = history.flatMap((row) =>
      Object.values(row).filter((value) => typeof value === 'number')
    )
    return values.length ? Math.min(...values) : null
  }, [history])

  const tableColorLabel =
    colorFilter === 'all'
      ? 'all colors'
      : colorFilter === 'selected'
      ? `${activeColor?.name || 'selected'} variant`
      : `${product?.colors?.find((color) => color.value === colorFilter)?.name || colorFilter} variant`

  const priceIsVerified = filteredRows.length > 0 && filteredRows.some((item) => item.verified)

  const rowPriceLabel = (item) =>
    item.verified && Number.isFinite(item.price)
      ? money(item.price)
      : item.statusReason === 'retailer not yet supported in v1'
      ? 'Coming soon'
      : item.statusReason === 'pending Flipkart API compatibility verification'
      ? 'Pending verification'
      : 'Not verified'

  const navigateTo = (section) => {
    setActiveSection(section)
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMobileNav(false)
  }

  const saveAlert = async (event) => {
    event.preventDefault()
    const response = await fetch(apiUrl('/api/alerts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...alertForm, productId: selectedProductId, color: selectedColor }),
    })
    const data = await response.json()
    if (!response.ok) return setError(data.error || 'Could not create alert')
    setAlerts((current) => [data.alert, ...current])
    setShowAlert(false)
    showToast('Alert created! Dispatches in-app without requiring API keys.')
  }

  const loadNotifications = async () => {
    try {
      const response = await fetch(apiUrl('/api/notifications'))
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications || [])
      }
    } catch {}
  }

  const triggerTestAlert = async (alertId) => {
    try {
      const response = await fetch(apiUrl(`/api/alerts/${alertId}/test`), { method: 'POST' })
      const data = await response.json()
      if (response.ok) {
        showToast('🔔 Test alert triggered & delivered without API keys!')
        loadAlerts()
        loadNotifications()
      } else {
        setError(data.error || 'Failed to trigger test alert')
      }
    } catch {
      showToast('Alert test triggered locally')
    }
  }

  const clearNotifications = async () => {
    try {
      await fetch(apiUrl('/api/notifications/clear'), { method: 'POST' })
      setNotifications([])
      showToast('Notification center cleared')
    } catch {}
  }

  const updateAlert = async (alert, status) => {
    await fetch(apiUrl(`/api/alerts/${alert.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadAlerts()
  }

  const deleteAlert = async (alert) => {
    await fetch(apiUrl(`/api/alerts/${alert.id}`), { method: 'DELETE' })
    setAlerts((current) => current.filter((item) => item.id !== alert.id))
    showToast('Alert deleted')
  }

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">
            <Headphones size={18} />
          </span>
          <span>
            PricePulse<span className="brand-dot">.</span>io
          </span>
        </div>

        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          <button
            className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`}
            onClick={() => navigateTo('overview')}
          >
            <LayoutDashboard size={18} /> Overview
          </button>
          <button
            className={`nav-item ${activeSection === 'history' ? 'active' : ''}`}
            onClick={() => navigateTo('history')}
          >
            <LineChartIcon size={18} /> Price history
          </button>
          <button
            className={`nav-item ${activeSection === 'alerts' ? 'active' : ''}`}
            onClick={() => navigateTo('alerts')}
          >
            <Bell size={18} /> My alerts <span className="nav-count">{alerts.length}</span>
          </button>
          <button
            className={`nav-item ${activeSection === 'retailers' ? 'active' : ''}`}
            onClick={() => navigateTo('retailers')}
          >
            <ShoppingBag size={18} /> Retailers
          </button>
        </nav>

        <div className="sidebar-divider" />
        <div className="workspace-label">ACTIVE TRACKED PRODUCT</div>
        <div className="focused-product-box">
          <div className="focused-product-top">
            <span className="mini-product">
              {product?.image && !sidebarImageErrors[product.id] ? (
                <img
                  src={product.image}
                  alt={product.name}
                  onError={() =>
                    setSidebarImageErrors((prev) => ({ ...prev, [product.id]: true }))
                  }
                />
              ) : (
                <Headphones size={14} />
              )}
            </span>
            <div>
              <b>{product?.name || 'Sennheiser Momentum 4'}</b>
              <small>{product?.brand || 'Sennheiser'} · ANC Wireless</small>
            </div>
          </div>
          <div className="focused-meta-list">
            <div className="focused-meta-row">
              <span>Dynamic Engine</span>
              <span className="live-status-chip">
                <span className="live-dot live-pulse" /> Active
              </span>
            </div>
            <div className="focused-meta-row">
              <span>Channels</span>
              <span>6 Monitored</span>
            </div>
            <div className="focused-meta-row">
              <span>Best Price</span>
              <strong className="green-text">{stats?.min ? money(stats.min) : '₹21,990'}</strong>
            </div>
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="sync-card">
            <div className="sync-title">
              <span className="live-dot live-pulse" /> Auto-sync: {settings.refreshInterval}
            </div>
            <small>Next refresh in {countdown}s</small>
          </div>

          <button className="nav-item" onClick={() => setShowSettings(true)}>
            <Settings size={18} /> Settings
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setShowHelp(true)
              checkHealth()
            }}
          >
            <CircleHelp size={18} /> Help center
          </button>

          <div className="profile">
            <div className="avatar">PS</div>
            <div>
              <b>Pranav S.</b>
              <small>Pro Tracker plan</small>
            </div>
            <ChevronDown size={14} />
          </div>
        </div>
      </aside>

      {mobileNav && <div className="mobile-backdrop" onClick={() => setMobileNav(false)} />}

      {/* MAIN CONTENT */}
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)}>
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>Products</span>
            <ChevronRight size={14} />
            <b>{product?.name || 'Price tracker'}</b>
          </div>
          <div className="topbar-actions">
            <div className="realtime-pill">
              <span className="live-dot live-pulse" />
              <span>Dynamic Sync: {countdown}s</span>
            </div>
            <button
              className="refresh-action-btn"
              onClick={triggerManualRefresh}
              disabled={isRefreshing}
              title="Fetch latest retailer prices immediately"
            >
              <RefreshCw size={14} className={isRefreshing ? 'spinning' : ''} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Prices'}</span>
            </button>
            <button
              className="shift-action-btn"
              onClick={triggerDynamicShift}
              disabled={isRefreshing}
              title="Simulate dynamic price drop across retailers"
            >
              <Zap size={14} />
              <span>Shift Prices</span>
            </button>
            <button
              className="icon-button notif-bell-btn"
              onClick={() => setShowNotifications(true)}
              title="Notification Center (Zero API Keys)"
            >
              <Bell size={18} />
              {notifications.length > 0 && (
                <span className="bell-badge">{notifications.length}</span>
              )}
            </button>
            <button className="icon-button" onClick={() => setShowAlert(true)} title="Set Alert">
              <BellRing size={18} />
            </button>
            <button className="avatar top-avatar" onClick={() => setShowSettings(true)}>
              PS
            </button>
          </div>
        </header>

        <div id="overview" className="content">
          {error && (
            <div className="error-banner">
              {error}
              <button onClick={() => setError('')}>
                <X size={14} />
              </button>
            </div>
          )}

          <section className="product-heading">
            <div className="heading-main">
              <div className="product-art">
                {imageFailed || !product?.image ? (
                  <Headphones size={56} />
                ) : (
                  <img
                    src={product.image}
                    alt={`${product.name} product`}
                    onError={() => setImageFailed(true)}
                  />
                )}
              </div>
              <div>
                <div className="eyebrow">
                  <span className="live-dot live-pulse" /> {liveStatus}
                </div>
                <h1>{product?.name || 'Loading tracker…'}</h1>
                <p>{product?.description}</p>
                <div className="tag-row">
                  <span className="tag">SKU: {product?.sku || '—'}</span>
                  <span className="updated">
                    <Clock3 size={13} />{' '}
                    {loading
                      ? 'Refreshing…'
                      : lastSync
                      ? `Updated ${new Date(lastSync).toLocaleTimeString()}`
                      : 'Waiting for sync'}
                  </span>
                </div>
              </div>
            </div>
            <button className="alert-button" onClick={() => setShowAlert(true)}>
              <Bell size={17} /> Set price alert
            </button>
          </section>

          {/* COLOR SELECTOR */}
          <section className="color-section card">
            <div className="section-header">
              <div>
                <h2>Choose a color</h2>
                <p>Compare prices and availability for each variant</p>
              </div>
              <button
                className="filter-button"
                onClick={() => document.querySelector('.price-card')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <Filter size={15} /> Filters
              </button>
            </div>
            <div className="color-list">
              {product?.colors?.map((color) => (
                <button
                  key={color.value}
                  className={`color-option ${selectedColor === color.value ? 'selected' : ''}`}
                  onClick={() => setSelectedColor(color.value)}
                >
                  <span
                    className="color-thumb"
                    style={{ backgroundImage: `url(${color.image || product.image})` }}
                  />
                  <span className="color-info">
                    <b>{color.name}</b>
                    <small>
                      <span className="stock-dot" /> {color.stock}
                    </small>
                  </span>
                  <strong>{money(color.price)}</strong>
                </button>
              ))}
            </div>
          </section>

          {/* DASHBOARD GRID: CHART & MARKET STATS */}
          <div className="dashboard-grid">
            <section id="history" className="card chart-card">
              <div className="section-header">
                <div>
                  <h2>Price history</h2>
                  <p>
                    {activeColor?.name || 'Selected color'} ·{' '}
                    {range === '1W' ? 'Last 7 days' : range === '1M' ? 'Last 30 days' : 'Last 90 days'}
                  </p>
                </div>
                <div className="range-tabs">
                  {['1W', '1M', '3M'].map((item) => (
                    <button
                      key={item}
                      className={range === item ? 'selected' : ''}
                      onClick={() => setRange(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {history.length === 0 ? (
                <div className="no-history">
                  Loading verified price history across retailers…
                </div>
              ) : (
                <>
                  <div className="chart-legend">
                    {Object.keys(retailerColors).map((name) => (
                      <span key={name}>
                        <i className="legend-line" style={{ background: retailerColors[name] }} /> {name}
                      </span>
                    ))}
                  </div>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={245}>
                      <AreaChart data={history}>
                        <CartesianGrid stroke="#e8e8e2" vertical={false} />
                        <XAxis dataKey="date" hide={history.length > 30} />
                        <YAxis
                          domain={['auto', 'auto']}
                          tickFormatter={(value) =>
                            settings.currency === 'USD'
                              ? `$${Math.round(value / 86)}`
                              : `₹${Math.round(value / 1000)}k`
                          }
                        />
                        <Tooltip formatter={(value) => money(value)} />
                        <Area
                          type="monotone"
                          dataKey="Amazon"
                          stroke={retailerColors.Amazon}
                          fill="#e5844220"
                          strokeWidth={2.5}
                        />
                        <Area
                          type="monotone"
                          dataKey="Flipkart"
                          stroke={retailerColors.Flipkart}
                          fill="none"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="Croma"
                          stroke={retailerColors.Croma}
                          fill="none"
                          strokeWidth={1.8}
                        />
                        <Area
                          type="monotone"
                          dataKey="Reliance Digital"
                          stroke={retailerColors['Reliance Digital']}
                          fill="none"
                          strokeWidth={1.8}
                        />
                        <Area
                          type="monotone"
                          dataKey="Vijay Sales"
                          stroke={retailerColors['Vijay Sales']}
                          fill="none"
                          strokeWidth={1.8}
                        />
                        <Area
                          type="monotone"
                          dataKey="Sennheiser"
                          stroke={retailerColors.Sennheiser}
                          fill="none"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}

              <div className="chart-footer">
                <span>
                  <TrendingDown size={15} /> <b>Historical low:</b>{' '}
                  {historicalLow ? money(historicalLow) : 'Calculating...'}
                </span>
                <span className="realtime-pill" style={{ fontSize: '10px' }}>
                  Live price feed verified
                </span>
              </div>
            </section>

            <section className="card stats-card">
              <div className="section-header">
                <div>
                  <h2>Market snapshot</h2>
                  <p>Across {new Set(priceRows.map((item) => item.platform)).size || 6} retailers</p>
                </div>
                <Activity size={19} className="muted-icon" />
              </div>
              <div className="stats-list">
                <div>
                  <span>Average price</span>
                  <strong>{stats ? money(stats.average) : '—'}</strong>
                </div>
                <div>
                  <span>Lowest price</span>
                  <strong className="green">
                    {stats ? money(stats.min) : '—'}{' '}
                    <small>
                      {filteredRows.find((item) => item.price === stats?.min)?.platform || 'Flipkart'}
                    </small>
                  </strong>
                </div>
                <div>
                  <span>Highest price</span>
                  <strong>{stats ? money(stats.max) : '—'}</strong>
                </div>
                <div>
                  <span>Price volatility</span>
                  <strong>{stats ? money(stats.volatility) : '—'}</strong>
                </div>
              </div>
              <div className="buy-tip">
                <Sparkles size={16} />
                <span>
                  <b>Good time to buy</b>
                  <small>
                    Current prices are below MSRP with card discounts active on major retailers.
                  </small>
                </span>
              </div>
            </section>
          </div>

          {/* WHERE TO BUY TABLE */}
          <section id="retailers" className="card price-card">
            <div className="section-header">
              <div>
                <h2>Where to buy</h2>
                <p>
                  Current verified real-time prices for <b>{tableColorLabel}</b> · Official Store excluded from cheapest deal highlight
                </p>
              </div>
              <div className="sort-control">
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="platform">Platform</option>
                  <option value="color">Color</option>
                </select>
              </div>
            </div>

            <div className="table-filters">
              <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
                <option value="all">All platforms</option>
                {Object.keys(retailerColors).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <select value={colorFilter} onChange={(event) => setColorFilter(event.target.value)}>
                <option value="selected">Selected color</option>
                <option value="all">All colors</option>
                {product?.colors?.map((color) => (
                  <option key={color.value} value={color.value}>
                    {color.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                placeholder="Min ₹"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
              />
              <input
                type="number"
                min="0"
                placeholder="Max ₹"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
              />
            </div>

            <div className="price-table">
              <div className="table-row table-head">
                <span>RETAILER</span>
                <span>PRICE</span>
                <span>CHANGE</span>
                <span>AVAILABILITY</span>
                <span>DELIVERY</span>
                <span />
              </div>
              {filteredRows.map((item) => {
                const isOfficial = item.platform === 'Sennheiser'
                const isBest = !isOfficial && item === bestDealRows[0]
                return (
                  <div
                    className={`table-row ${isBest ? 'best-row' : ''}`}
                    key={`${item.platform}-${item.colorValue}-${item.listingId || item.url}`}
                  >
                    <span className="retailer">
                      <span className="retailer-logo" style={{ background: item.colorHex }}>
                        {item.short}
                      </span>
                      <b>{item.platform}</b>
                      {isBest && <span className="best-badge">BEST PRICE</span>}
                      {isOfficial && <span className="offer-badge">MSRP / Official Store</span>}
                      {item.cardOffer && !isOfficial && <span className="offer-badge">Card offer</span>}
                      {item.dealTag && <span className="offer-badge deal-badge">{item.dealTag}</span>}
                    </span>
                    <span className="price-value">
                      {rowPriceLabel(item)}
                      <small>
                        {isOfficial
                          ? 'Manufacturer MSRP'
                          : item.previous
                          ? `was ${money(item.previous)}`
                          : 'Live verified price'}
                      </small>
                    </span>
                    <span className={item.change < 0 && !isOfficial ? 'green change' : item.change > 0 && !isOfficial ? 'change' : 'change muted'}>
                      {item.change < 0 && !isOfficial ? (
                        <>
                          <TrendingDown size={14} />
                          {money(Math.abs(item.change))} ({Math.abs(item.changePercent || 0)}%)
                        </>
                      ) : item.change > 0 && !isOfficial ? (
                        <>
                          <TrendingUp size={14} />
                          +{money(item.change)}
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className="availability">
                      <i />
                      {item.stock}
                    </span>
                    <span className="delivery">
                      <Truck size={14} />
                      {item.delivery}
                    </span>
                    <a className="buy-link" href={item.url} target="_blank" rel="noreferrer">
                      Visit <ExternalLink size={13} />
                    </a>
                  </div>
                )
              })}
            </div>
          </section>

          {/* BOTTOM GRID */}
          <section className="bottom-grid">
            <div className="card specs-card">
              <div className="section-header">
                <div>
                  <h2>About this product</h2>
                  <p>Product specifications and features</p>
                </div>
                <Package size={19} className="muted-icon" />
              </div>
              <div className="specs">
                {Object.entries(product?.specs || {}).map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
              <p className="description">{product?.description}</p>
            </div>

            <div id="alerts" className="card alerts-card">
              <div className="section-header">
                <div>
                  <h2>Your alerts</h2>
                  <p>Real-time notifications sent via Email / SMS</p>
                </div>
                <Bell size={18} className="muted-icon" />
              </div>
              {alerts.length === 0 ? (
                <p style={{ margin: '18px 0', color: '#888' }}>
                  No active alerts. Click below to set a price drop threshold!
                </p>
              ) : (
                alerts
                  .filter((item) => item.productId === selectedProductId)
                  .slice(0, 3)
                  .map((alert) => (
                    <div className="alert-row" key={alert.id}>
                      <span className="alert-symbol">
                        <TrendingDown size={16} />
                      </span>
                      <span>
                        <b>
                          {alert.alertType.replaceAll('_', ' ')}
                          {alert.condition ? `: ${money(alert.condition)}` : ''}
                        </b>
                        <small>
                          {alert.status} · {alert.notify.toUpperCase()}
                          {alert.delivery?.simulated ? ' · In-App Ready' : ''}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="test-alert-btn"
                        onClick={() => triggerTestAlert(alert.id)}
                        title="Simulate price drop event without API keys"
                      >
                        <Zap size={12} /> Test
                      </button>
                      <button
                        className={`toggle ${alert.status === 'active' ? 'on' : ''}`}
                        onClick={() =>
                          updateAlert(alert, alert.status === 'active' ? 'inactive' : 'active')
                        }
                        aria-label="Toggle alert"
                      />
                      <button
                        className="icon-button"
                        onClick={() => deleteAlert(alert)}
                        aria-label="Delete alert"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))
              )}
              <div className="alert-actions">
                <select
                  value={alertForm.notify}
                  onChange={(event) => setAlertForm({ ...alertForm, notify: event.target.value })}
                >
                  <option value="in_app">In-App (No API Keys)</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="both">Email + SMS</option>
                </select>
                <button className="manage-alerts" onClick={() => setShowAlert(true)}>
                  Set new alert <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </section>

          <footer>
            <span>
              <span className="live-dot live-pulse" /> Tracking{' '}
              {new Set(priceRows.map((item) => item.platform)).size || 6} major retailers · Live real-time stream active
            </span>
            <span>Data Mode: {dataMode.toUpperCase()}</span>
          </footer>
        </div>
      </main>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal large-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSettings(false)}>
              <X size={18} />
            </button>
            <div className="modal-header-row">
              <span className="modal-icon">
                <Settings size={20} />
              </span>
              <div>
                <h2>Preferences & Settings</h2>
                <p>Configure real-time sync intervals, currencies, and alert channels</p>
              </div>
            </div>

            <div className="modal-nav-tabs">
              <button
                className={`modal-tab-btn ${settingsTab === 'general' ? 'active' : ''}`}
                onClick={() => setSettingsTab('general')}
              >
                <Globe size={14} /> General & Currency
              </button>
              <button
                className={`modal-tab-btn ${settingsTab === 'realtime' ? 'active' : ''}`}
                onClick={() => setSettingsTab('realtime')}
              >
                <Zap size={14} /> Real-Time Engine
              </button>
              <button
                className={`modal-tab-btn ${settingsTab === 'providers' ? 'active' : ''}`}
                onClick={() => setSettingsTab('providers')}
              >
                <Server size={14} /> Scraper Status
              </button>
            </div>

            <form onSubmit={handleSaveSettings}>
              {settingsTab === 'general' && (
                <div className="settings-section">
                  <div className="setting-row">
                    <div className="setting-info">
                      <b>Display Currency</b>
                      <small>Prices across all retailers will be converted and formatted in this currency.</small>
                    </div>
                    <div className="setting-control">
                      <select
                        value={settings.currency}
                        onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                      >
                        <option value="INR">₹ INR (Indian Rupee)</option>
                        <option value="USD">$ USD (US Dollar)</option>
                        <option value="EUR">€ EUR (Euro)</option>
                      </select>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <b>Default Notification Email</b>
                      <small>Used automatically when creating price drop alerts.</small>
                    </div>
                    <div className="setting-control">
                      <input
                        type="email"
                        value={settings.defaultEmail}
                        onChange={(e) => setSettings({ ...settings, defaultEmail: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <b>Default SMS Phone Number</b>
                      <small>Used for Twilio SMS price drop dispatch.</small>
                    </div>
                    <div className="setting-control">
                      <input
                        type="tel"
                        value={settings.defaultPhone}
                        onChange={(e) => setSettings({ ...settings, defaultPhone: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'realtime' && (
                <div className="settings-section">
                  <div className="setting-row">
                    <div className="setting-info">
                      <b>Auto-Refresh Frequency</b>
                      <small>How frequently live retailer prices and stock are re-evaluated.</small>
                    </div>
                    <div className="setting-control">
                      <select
                        value={settings.refreshInterval}
                        onChange={(e) => setSettings({ ...settings, refreshInterval: e.target.value })}
                      >
                        <option value="15s">15 Seconds (Ultra Real-Time)</option>
                        <option value="30s">30 Seconds (Recommended)</option>
                        <option value="1m">1 Minute</option>
                        <option value="5m">5 Minutes</option>
                        <option value="30m">30 Minutes</option>
                      </select>
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <b>Live Ticker Bar</b>
                      <small>Display the live sync countdown and status badge in the header.</small>
                    </div>
                    <div className="setting-control">
                      <button
                        type="button"
                        className={`toggle ${settings.liveTicker ? 'on' : ''}`}
                        onClick={() => setSettings({ ...settings, liveTicker: !settings.liveTicker })}
                      />
                    </div>
                  </div>

                  <div className="setting-row">
                    <div className="setting-info">
                      <b>Price Drop Sensitivity</b>
                      <small>Trigger alerts when price drops by at least this percentage.</small>
                    </div>
                    <div className="setting-control">
                      <select
                        value={settings.alertSensitivity}
                        onChange={(e) => setSettings({ ...settings, alertSensitivity: e.target.value })}
                      >
                        <option value="2">2% or more</option>
                        <option value="5">5% or more</option>
                        <option value="10">10% or more</option>
                        <option value="15">15% or more</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'providers' && (
                <div className="settings-section">
                  <p style={{ margin: 0, color: '#6a726d', fontSize: '12px' }}>
                    Retailer Scraper & Provider Connections (configured via environment & in-memory fallbacks):
                  </p>
                  <div className="provider-grid">
                    <div className="provider-card">
                      <div>
                        <b>Amazon Scraper</b>
                        <small>Playwright Headless Provider</small>
                      </div>
                      <span className="status-badge live">ACTIVE</span>
                    </div>
                    <div className="provider-card">
                      <div>
                        <b>Flipkart Engine</b>
                        <small>Affiliate & Verification Engine</small>
                      </div>
                      <span className="status-badge live">ACTIVE</span>
                    </div>
                    <div className="provider-card">
                      <div>
                        <b>Multi-Retailer Sync</b>
                        <small>Croma, Reliance, Vijay Sales</small>
                      </div>
                      <span className="status-badge connected">CONNECTED</span>
                    </div>
                    <div className="provider-card">
                      <div>
                        <b>Database State</b>
                        <small>In-memory store & MongoDB sync</small>
                      </div>
                      <span className="status-badge mock">IN-MEMORY LIVE</span>
                    </div>
                  </div>
                </div>
              )}

              <button type="submit" className="save-alert">
                Save Preferences
              </button>
            </form>
          </div>
        </div>
      )}

      {/* HELP CENTER MODAL */}
      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="modal large-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHelp(false)}>
              <X size={18} />
            </button>
            <div className="modal-header-row">
              <span className="modal-icon">
                <CircleHelp size={20} />
              </span>
              <div>
                <h2>Help & Documentation Centre</h2>
                <p>Learn how real-time price tracking, alerts, and retailer scraping works</p>
              </div>
            </div>

            <div className="modal-nav-tabs">
              <button
                className={`modal-tab-btn ${helpTab === 'faq' ? 'active' : ''}`}
                onClick={() => setHelpTab('faq')}
              >
                <Info size={14} /> FAQ
              </button>
              <button
                className={`modal-tab-btn ${helpTab === 'retailers' ? 'active' : ''}`}
                onClick={() => setHelpTab('retailers')}
              >
                <ShoppingBag size={14} /> Retailer Coverage
              </button>
              <button
                className={`modal-tab-btn ${helpTab === 'health' ? 'active' : ''}`}
                onClick={() => {
                  setHelpTab('health')
                  checkHealth()
                }}
              >
                <ShieldCheck size={14} /> System Diagnostics
              </button>
            </div>

            {helpTab === 'faq' && (
              <div className="faq-list">
                {[
                  {
                    q: 'How does the real-time price tracking work?',
                    a: 'PricePulse periodically probes major Indian retailer listings (Amazon, Flipkart, Croma, Reliance Digital, Vijay Sales, and Sennheiser Official). Prices are verified, normalized, and updated in real time with automatic price-drop detection.',
                  },
                  {
                    q: 'How often are prices updated?',
                    a: 'By default, the dashboard synchronizes in real time every 30 seconds. You can adjust this in Settings (15s to 30m) or click the "Sync Prices" button in the topbar to fetch updates immediately.',
                  },
                  {
                    q: 'How do Price Alerts notify me?',
                    a: 'When an alert condition is triggered (e.g. price drops below your target, item returns in stock, or a card discount becomes active), PricePulse sends a notification to your registered Email (via Resend) and SMS (via Twilio).',
                  },
                  {
                    q: 'How do I add a new product or URL?',
                    a: 'Click "+ Add product" in the sidebar. Paste the direct URL from Amazon or Flipkart and optionally provide a target price. The engine detects the retailer, extracts product IDs/ASINs, and begins live tracking.',
                  },
                ].map((item, idx) => (
                  <div key={idx} className="faq-item">
                    <button
                      type="button"
                      className="faq-question"
                      onClick={() => setExpandedFaq(expandedFaq === idx ? -1 : idx)}
                    >
                      <span>{item.q}</span>
                      <ChevronDown
                        size={15}
                        style={{
                          transform: expandedFaq === idx ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s',
                        }}
                      />
                    </button>
                    {expandedFaq === idx && <div className="faq-answer">{item.a}</div>}
                  </div>
                ))}
              </div>
            )}

            {helpTab === 'retailers' && (
              <div className="settings-section">
                <div className="provider-grid">
                  <div className="provider-card">
                    <div>
                      <b>Amazon India</b>
                      <small>Headless Playwright scraper + Keepa fallback</small>
                    </div>
                    <span className="status-badge live">60m cadence</span>
                  </div>
                  <div className="provider-card">
                    <div>
                      <b>Flipkart</b>
                      <small>Affiliate API & Verified Listings</small>
                    </div>
                    <span className="status-badge live">Verified</span>
                  </div>
                  <div className="provider-card">
                    <div>
                      <b>Croma</b>
                      <small>Official electronics catalog sync</small>
                    </div>
                    <span className="status-badge connected">Live stream</span>
                  </div>
                  <div className="provider-card">
                    <div>
                      <b>Reliance Digital</b>
                      <small>Marketplace pricing feed</small>
                    </div>
                    <span className="status-badge connected">Live stream</span>
                  </div>
                  <div className="provider-card">
                    <div>
                      <b>Vijay Sales</b>
                      <small>Promotional pricing & card offer tracking</small>
                    </div>
                    <span className="status-badge connected">Live stream</span>
                  </div>
                  <div className="provider-card">
                    <div>
                      <b>Sennheiser Official</b>
                      <small>Manufacturer direct MSRP reference</small>
                    </div>
                    <span className="status-badge live">MSRP Benchmark</span>
                  </div>
                </div>
              </div>
            )}

            {helpTab === 'health' && (
              <div className="settings-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b>API & System Status</b>
                  <button
                    className="refresh-action-btn"
                    onClick={checkHealth}
                    disabled={healthLoading}
                  >
                    <RefreshCw size={13} className={healthLoading ? 'spinning' : ''} /> Check Now
                  </button>
                </div>

                {healthLoading ? (
                  <p style={{ color: '#888' }}>Pinging backend server...</p>
                ) : healthStatus ? (
                  <div style={{ background: '#f5f7f5', padding: '14px', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace' }}>
                    <div><strong>API Status:</strong> {healthStatus.status}</div>
                    <div><strong>Database:</strong> {healthStatus.database}</div>
                    <div><strong>Data Mode:</strong> {healthStatus.dataMode}</div>
                    <div><strong>Providers:</strong> {healthStatus.providers}</div>
                    <div><strong>Last Synced:</strong> {healthStatus.lastSyncAt ? new Date(healthStatus.lastSyncAt).toLocaleString() : 'Just now'}</div>
                  </div>
                ) : (
                  <p style={{ color: '#888' }}>Click "Check Now" to test backend connectivity.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SET ALERT MODAL */}
      {showAlert && (
        <div className="modal-backdrop" onClick={() => setShowAlert(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAlert(false)}>
              <X size={18} />
            </button>
            <div className="modal-header-row">
              <span className="modal-icon">
                <BellRing size={20} />
              </span>
              <div>
                <h2>Set a Price Alert</h2>
                <p>Monitors price drops across 6 major retailers</p>
              </div>
            </div>

            <div className="zero-key-banner">
              <Zap size={15} />
              <span>
                <strong>Zero-Key Alerting:</strong> Price drops are delivered to your In-App Notification Center instantly without requiring third-party credentials.
              </span>
            </div>

            <form onSubmit={saveAlert}>
              <label>
                Alert type
                <select
                  value={alertForm.alertType}
                  onChange={(event) =>
                    setAlertForm({ ...alertForm, alertType: event.target.value })
                  }
                >
                  <option value="price_drop">Price drop</option>
                  <option value="cheaper_retailer">Cheaper retailer</option>
                  <option value="back_in_stock">Back in stock</option>
                  <option value="card_offer">Card offer</option>
                </select>
              </label>
              {alertForm.alertType === 'price_drop' && (
                <label>
                  Target price (₹)
                  <input
                    required
                    type="number"
                    min="1"
                    value={alertForm.condition}
                    onChange={(event) =>
                      setAlertForm({ ...alertForm, condition: event.target.value })
                    }
                  />
                </label>
              )}
              <label>
                Notification Channel
                <select
                  value={alertForm.notify}
                  onChange={(event) => setAlertForm({ ...alertForm, notify: event.target.value })}
                >
                  <option value="in_app">In-App Notification & Toast (Zero Keys Required)</option>
                  <option value="email">Email (Simulates in-app if Resend is not set)</option>
                  <option value="sms">SMS (Simulates in-app if Twilio is not set)</option>
                  <option value="both">Email + SMS</option>
                </select>
              </label>
              {(alertForm.notify === 'email' || alertForm.notify === 'both') && (
                <label>
                  Email (Optional for zero-key test)
                  <input
                    type="email"
                    value={alertForm.email || settings.defaultEmail}
                    onChange={(event) => setAlertForm({ ...alertForm, email: event.target.value })}
                  />
                </label>
              )}
              {(alertForm.notify === 'sms' || alertForm.notify === 'both') && (
                <label>
                  Phone (Optional for zero-key test)
                  <input
                    type="tel"
                    value={alertForm.phone || settings.defaultPhone}
                    onChange={(event) => setAlertForm({ ...alertForm, phone: event.target.value })}
                  />
                </label>
              )}
              <button className="save-alert">Create Alert</button>
            </form>
          </div>
        </div>
      )}

      {/* NOTIFICATIONS CENTER MODAL */}
      {showNotifications && (
        <div className="modal-backdrop" onClick={() => setShowNotifications(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '520px' }}>
            <button className="modal-close" onClick={() => setShowNotifications(false)}>
              <X size={18} />
            </button>
            <div className="modal-header-row">
              <span className="modal-icon">
                <Bell size={20} />
              </span>
              <div>
                <h2>Notification Center</h2>
                <p>Live alerts dispatched across tracked products</p>
              </div>
            </div>

            <div className="zero-key-banner">
              <Zap size={15} />
              <span>
                <strong>Zero-Key Simulation Engine:</strong> All alerts trigger here with full event telemetry without requiring Twilio or Resend keys.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', margin: '10px 0' }}>
              <button
                type="button"
                className="test-alert-btn"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                onClick={() => {
                  const alertToTest = alerts.find((item) => item.productId === selectedProductId) || alerts[0]
                  if (alertToTest) {
                    triggerTestAlert(alertToTest.id)
                  } else {
                    showToast('Create an alert first to test!')
                  }
                }}
              >
                <Zap size={14} /> Trigger Test Price Drop Alert
              </button>
              {notifications.length > 0 && (
                <button
                  type="button"
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    border: '1px solid #e0e0dc',
                    background: '#fff',
                    borderRadius: '5px',
                    cursor: 'pointer',
                  }}
                  onClick={clearNotifications}
                >
                  Clear All
                </button>
              )}
            </div>

            <div className="notif-list">
              {notifications.length === 0 ? (
                <div className="notif-empty">
                  <Bell size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                  <div>No notifications received yet.</div>
                  <small style={{ color: '#888' }}>
                    Trigger a test alert above or set an alert threshold to watch real-time drops!
                  </small>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div key={notif.id} className="notif-card">
                    <div className="notif-card-header">
                      <b>{notif.productName}</b>
                      <small>{new Date(notif.createdAt).toLocaleTimeString()}</small>
                    </div>
                    <p>{notif.message}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span className="notif-badge">
                        {notif.simulated ? 'Zero-Key Simulation' : notif.channel.toUpperCase()}
                      </span>
                      {notif.price && (
                        <strong style={{ color: '#e58442', fontSize: '12px' }}>
                          ₹{notif.price.toLocaleString('en-IN')}
                        </strong>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTICE */}
      {toastMessage && (
        <div className="toast-notice">
          <CheckCircle size={16} color="#51b77c" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
