import { useEffect, useState } from 'react'
import './App.css'

const API_BASE_URL = 'http://100.110.65.94:8000'

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`
}

function formatMemory(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  const mebibytes = bytes / 1024 / 1024
  return mebibytes >= 1024
    ? `${(mebibytes / 1024).toFixed(2)} GiB`
    : `${mebibytes.toFixed(1)} MiB`
}

function InfoTooltip({ label, align = 'left', children }) {
  const tooltipId = `metric-info-${label.toLowerCase().replaceAll(' ', '-')}`

  return (
    <details className={`metric-info metric-info--${align}`}>
      <summary aria-label={`${label} information`} aria-describedby={tooltipId}>
        <span aria-hidden="true">i</span>
      </summary>
      <span className="metric-tooltip" id={tooltipId} role="tooltip">
        {children}
      </span>
    </details>
  )
}

function Gauge({ value, label, detail, info, align }) {
  const hasValue = value !== null && value !== undefined && Number.isFinite(Number(value))
  const safeValue = hasValue ? Math.min(100, Math.max(0, Number(value))) : 0

  return (
    <article className="metric-card">
      <div className="metric-heading">
        <div className="metric-label-line">
          <h2 className="metric-label">{label}</h2>
          <InfoTooltip label={label} align={align}>{info}</InfoTooltip>
        </div>
        <p className="metric-detail">{detail}</p>
      </div>

      <div className="metric-reading">
        <strong className="metric-value">{hasValue ? safeValue.toFixed(1) : '—'}</strong>
        <span className="metric-unit">{hasValue ? '%' : ''}</span>
      </div>

      <div
        className="metric-meter"
        role="meter"
        aria-label={label}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={hasValue ? safeValue : undefined}
        aria-valuetext={hasValue ? `${safeValue.toFixed(1)} percent` : 'No data'}
      >
        <span className="metric-meter-value" style={{ width: `${safeValue}%` }} />
      </div>
    </article>
  )
}

function Trend({ history, accent }) {
  const points = history.slice(-24)
  if (points.length < 2) return <div className="trend-empty">Collecting samples</div>

  const width = 360
  const height = 56
  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width
    const y = height - (point / 100) * (height - 8) - 4
    return `${x},${y}`
  })

  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ContainerTable({ containers }) {
  return (
    <div className="container-table-wrap">
      <table className="container-table" aria-label="Docker containers">
        <thead>
          <tr>
            <th scope="col">Container</th>
            <th scope="col">Image</th>
            <th scope="col">Status</th>
            <th scope="col">Health</th>
            <th scope="col" title="CPU usage from the latest Docker stats sample">CPU</th>
            <th scope="col" title="Memory currently used; no container limit is reported">Memory</th>
          </tr>
        </thead>
        <tbody>
          {containers.map((container) => {
            const status = container.status || 'unknown'
            const health = container.health_status
            const statusTone = health === 'unhealthy' || status === 'dead'
              ? 'critical'
              : status === 'running'
                ? health === 'starting' ? 'warning' : 'healthy'
                : 'stopped'
            const healthTone = health === 'healthy'
              ? 'healthy'
              : health === 'unhealthy'
                ? 'critical'
                : health === 'starting'
                  ? 'warning'
                  : 'muted'

            return (
              <tr key={container.id}>
                <td data-label="Container">
                  <div className="container-name">
                    <strong>{container.name}</strong>
                    <code>{container.id}</code>
                  </div>
                </td>
                <td data-label="Image">
                  <code className="container-image" title={container.image}>{container.image}</code>
                </td>
                <td data-label="Status">
                  <span className={`state-value state-value--${statusTone}`}>
                    <i aria-hidden="true" />
                    {status}
                  </span>
                </td>
                <td data-label="Health">
                  <span className={`health-value health-value--${healthTone}`}>
                    {health || 'No check'}
                  </span>
                </td>
                <td data-label="CPU" className="technical-value">
                  {container.cpu_percent == null ? '—' : `${container.cpu_percent.toFixed(1)}%`}
                </td>
                <td data-label="Memory" className="technical-value">
                  {formatMemory(container.memory_usage_bytes)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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

  const uptime = metrics ? formatDuration(metrics.uptime_seconds) : null
  const updatedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    : 'Waiting for data'

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">SW</span>
          <div>
            <p className="eyebrow">Infrastructure monitor</p>
            <h1>ServerWatch</h1>
          </div>
        </div>

        <div className="header-meta">
          <div className="host-identity">
            <span className="meta-label">Host</span>
            <strong>{metrics?.hostname || 'Home'}</strong>
            {uptime && <span className="uptime">Uptime {uptime}</span>}
          </div>
          <div className={`connection-status ${connected ? 'is-connected' : ''}`}>
            <span className="status-dot" aria-hidden="true" />
            <div>
              <strong>{connected ? 'Connected' : 'Reconnecting'}</strong>
              <span>Updated {updatedTime}</span>
            </div>
          </div>
        </div>
      </header>

      {metrics ? (
        <section className="metrics-section" aria-label="System metrics">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Host telemetry</p>
              <h2>System resources</h2>
            </div>
            <span className="section-note">Live · 2 sec interval</span>
          </div>

          <div className="metrics-grid">
            <Gauge
              value={metrics.cpu_percent}
              label="CPU"
              detail="Current processor activity"
              align="left"
              info={(
                <span>
                  Current CPU utilization is <b>{Number(metrics.cpu_percent).toFixed(1)}%</b> of the
                  reported capacity. This reflects current activity, not total processor capacity.
                </span>
              )}
            />
            <Gauge
              value={metrics.ram_percent}
              label="RAM"
              detail="Memory in use"
              align="center"
              info={(
                <span>
                  The percentage of available RAM currently used by applications and operating
                  system processes. This API reports the percentage, not used and total byte values.
                </span>
              )}
            />
            <Gauge
              value={metrics.disk_percent}
              label="Disk"
              detail="Root filesystem · /"
              align="right"
              info={(
                <span>
                  Used storage as a percentage of the root filesystem (<code>/</code>). The API
                  reports the percentage, not used and total byte values.
                </span>
              )}
            />
          </div>

          <section className="trend-panel" aria-label="Recent resource trend">
            <div className="trend-heading">
              <h2>Recent activity</h2>
              <span>Samples from this session</span>
            </div>
            <div className="trend-grid">
              <div className="trend-row">
                <span>CPU</span>
                <Trend history={history.cpu} accent="#83b88d" />
              </div>
              <div className="trend-row">
                <span>RAM</span>
                <Trend history={history.ram} accent="#a1b99a" />
              </div>
              <div className="trend-row">
                <span>Disk</span>
                <Trend history={history.disk} accent="#c4a66a" />
              </div>
            </div>
          </section>
        </section>
      ) : (
        <section className="metrics-loading" role="status">
          <span className="loading-indicator" aria-hidden="true" />
          <div>
            <h2>Waiting for host metrics</h2>
            <p>ServerWatch will update as soon as Home is reachable.</p>
          </div>
        </section>
      )}

      <section className="containers-panel" aria-labelledby="containers-heading">
        <div className="containers-header">
          <div>
            <p className="eyebrow">Docker runtime</p>
            <h2 id="containers-heading">Containers</h2>
          </div>
          <span className="container-count">
            {containers === null ? '—' : `${containers.length} total`}
            <span> · refresh 5 sec</span>
          </span>
        </div>

        {containersError && (
          <p className="containers-error" role="alert">{containersError}</p>
        )}
        {containers === null ? (
          <p className="containers-message">Loading container inventory…</p>
        ) : containers.length === 0 ? (
          <p className="containers-message">No containers found.</p>
        ) : (
          <ContainerTable containers={containers} />
        )}
      </section>
    </main>
  )
}

export default App
