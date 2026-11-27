import { useEffect, useState } from 'react'
import './App.css'

const API_BASE_URL = 'http://100.110.65.94:8000'

function Gauge({ value, label, detail, accent, icon }) {
  const safeValue = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  const circumference = 2 * Math.PI * 54
  const offset = circumference - (safeValue / 100) * circumference

  return (
    <article className="metric-card" style={{ '--accent': accent }}>
      <div className="metric-heading">
        <span className="metric-icon" aria-hidden="true">{icon}</span>
        <div>
          <p className="metric-label">{label}</p>
          <p className="metric-detail">{detail}</p>
        </div>
      </div>

      <div className="gauge">
        <svg viewBox="0 0 128 128" role="img" aria-label={`${label}: ${safeValue.toFixed(1)} percent`}>
          <circle className="gauge-track" cx="64" cy="64" r="54" />
          <circle
            className="gauge-value"
            cx="64"
            cy="64"
            r="54"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="gauge-reading">
          <strong>{safeValue.toFixed(1)}</strong>
          <span>%</span>
        </div>
      </div>
    </article>
  )
}

function Trend({ history, accent }) {
  const points = history.slice(-24)
  if (points.length < 2) return <div className="trend-empty">Collecting trend data…</div>

  const width = 360
  const height = 72
  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width
    const y = height - (point / 100) * (height - 8) - 4
    return `${x},${y}`
  })
  const areaCoords = `0,${height} ${coords.join(' ')} ${width},${height}`

  return (
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`trend-fill-${accent.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={areaCoords}
        fill={`url(#trend-fill-${accent.replace('#', '')})`}
      />
      <polyline points={coords.join(' ')} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function App() {
  const [metrics, setMetrics] = useState(null)
  const [connected, setConnected] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [history, setHistory] = useState({ cpu: [], ram: [], disk: [] })
  const [containers, setContainers] = useState(null)
  const [containersError, setContainersError] = useState('')

  useEffect(() => {
    const fetchMetrics = () => {
      fetch(`${API_BASE_URL}/metrics`)
        .then((res) => res.json())
        .then((data) => {
          setMetrics(data)
          setConnected(true)
          setLastUpdated(new Date())
          setHistory((current) => ({
            cpu: [...current.cpu.slice(-23), Number(data.cpu_percent) || 0],
            ram: [...current.ram.slice(-23), Number(data.ram_percent) || 0],
            disk: [...current.disk.slice(-23), Number(data.disk_percent) || 0],
          }))
        })
        .catch(() => setConnected(false))
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchContainers = () => {
      fetch(`${API_BASE_URL}/containers`)
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.detail || 'Unable to load Docker containers')
          }
          return res.json()
        })
        .then((data) => {
          setContainers(data)
          setContainersError('')
        })
        .catch((error) => {
          setContainersError(error.message || 'Unable to load Docker containers')
        })
    }

    fetchContainers()
    const interval = setInterval(fetchContainers, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 14h16M7 14V9m5 5V5m5 9v-6" />
            </svg>
          </span>
          <div>
            <p className="eyebrow">ServerWatch</p>
            <h1>System overview</h1>
          </div>
        </div>

        <div className="status">
          <span className={connected ? 'status-dot live' : 'status-dot'} />
          <div>
            <strong>{connected ? 'System online' : 'Reconnecting'}</strong>
            <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Waiting for data'}</span>
          </div>
        </div>
      </header>

      {metrics ? (
        <>
          <section className="metrics-grid" aria-label="Server metrics">
            <Gauge
              value={metrics.cpu_percent}
              label="CPU usage"
              detail="Processor load"
              accent="#8b5cf6"
              icon={<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 3v4m6-4v4M9 17v4m6-4v4M3 9h4m-4 6h4m10-6h4m-4 6h4"/></svg>}
            />
            <Gauge
              value={metrics.ram_percent}
              label="Memory usage"
              detail="RAM utilization"
              accent="#22c55e"
              icon={<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 17v3m5-3v3m5-3v3M7 7V4m5 3V4m5 3V4"/></svg>}
            />
            <Gauge
              value={metrics.disk_percent}
              label="Disk usage"
              detail="Root filesystem"
              accent="#f59e0b"
              icon={<svg viewBox="0 0 24 24"><ellipse cx="12" cy="7" rx="8" ry="3"/><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>}
            />
          </section>

          <section className="trend-panel">
            <div className="trend-header">
              <div>
                <p className="eyebrow">Live activity</p>
                <h2>Resource trend</h2>
              </div>
              <div className="trend-legend">
                <span><i style={{ background: '#8b5cf6' }} />CPU</span>
                <span><i style={{ background: '#22c55e' }} />Memory</span>
                <span><i style={{ background: '#f59e0b' }} />Disk</span>
              </div>
            </div>
            <div className="trend-grid">
              <div className="trend-row"><span>CPU</span><Trend history={history.cpu} accent="#8b5cf6" /></div>
              <div className="trend-row"><span>Memory</span><Trend history={history.ram} accent="#22c55e" /></div>
              <div className="trend-row"><span>Disk</span><Trend history={history.disk} accent="#f59e0b" /></div>
            </div>
          </section>
        </>
      ) : (
        <section className="loading-state">
          <div className="loading-ring" />
          <h2>Connecting to server</h2>
          <p>Waiting for metrics from Home</p>
        </section>
      )}

      <section className="containers-panel" aria-labelledby="containers-heading">
        <div className="containers-header">
          <div>
            <p className="eyebrow">Docker</p>
            <h2 id="containers-heading">Containers</h2>
          </div>
          <span className="containers-refresh">Refreshes every 5 seconds</span>
        </div>

        {containersError && (
          <p className="containers-error" role="alert">{containersError}</p>
        )}
        {containers === null ? (
          <p className="containers-message">Loading containers…</p>
        ) : containers.length === 0 ? (
          <p className="containers-message">No containers found.</p>
        ) : (
          <div className="containers-grid">
            {containers.map((container) => {
              const isUnhealthy = container.health_status === 'unhealthy'
              const isRunning = container.status === 'running'
              const stateClass = isUnhealthy ? 'unhealthy' : isRunning ? 'running' : 'stopped'
              const healthLabel = container.health_status || 'No health check'

              return (
                <article className={`container-card ${stateClass}`} key={container.id}>
                  <div className="container-title">
                    <h3>{container.name}</h3>
                    <span className={`container-status ${stateClass}`}>
                      {container.status}
                    </span>
                  </div>
                  <p className="container-image" title={container.image}>{container.image}</p>
                  <p className="container-health">
                    <span>Health</span>
                    <strong>{healthLabel}</strong>
                  </p>
                  {(container.cpu_percent !== null || container.memory_usage_bytes !== null) && (
                    <p className="container-usage">
                      {container.cpu_percent !== null && `CPU ${container.cpu_percent}%`}
                      {container.cpu_percent !== null && container.memory_usage_bytes !== null && ' · '}
                      {container.memory_usage_bytes !== null
                        && `Memory ${(container.memory_usage_bytes / 1024 / 1024).toFixed(1)} MiB`}
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

export default App
