const POLL_INTERVAL = 5000

const API = (() => {
  const url = new URL(location)
  if (url.searchParams.has('api')) return url.searchParams.get('api')
  const script = document.querySelector('script[src$="dashboard.js"]')
  if (script && script.dataset.api) return script.dataset.api
  return '/api/sheepcounter/stats'
})()

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

const els = {
  totalViews:     $('#totalViews'),
  todayViews:     $('#todayViews'),
  uniqueVisitors: $('#uniqueVisitors'),
  eventCount:     $('#eventCount'),
  botCount:       $('#botCount'),
  pagesSubtitle:  $('#pagesSubtitle'),
  topPages:       $('#topPages'),
  viewsOverTime:  $('#viewsOverTime'),
  topReferrers:   $('#topReferrers'),
  browsers:       $('#browsers'),
  systems:        $('#systems'),
  languages:      $('#languages'),
  screenSizes:    $('#screenSizes'),
  recentViews:    $('#recentViews'),
  lastUpdated:    $('#lastUpdated'),
  statusDot:      $('#statusDot'),
  statusText:     $('#statusText'),
}

function setStatus(state) {
  els.statusDot.className = 'status-dot ' + state
  const labels = { connected: 'Connected', loading: 'Connecting…', error: 'Error' }
  els.statusText.textContent = labels[state] || state
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return 'just now'
  if (sec < 60) return sec + 's ago'
  const min = Math.floor(sec / 60)
  if (min < 60) return min + 'm ago'
  const hr = Math.floor(min / 60)
  if (hr < 24) return hr + 'h ago'
  const d = Math.floor(hr / 24)
  return d + 'd ago'
}

function esc(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

function renderPages(pages, subtitleEl) {
  if (!pages || pages.length === 0) return '<p class="empty">No data yet</p>'
  const total = pages.reduce((s, p) => s + p.count, 0)
  subtitleEl.textContent = total + ' visits'
  const max = Math.max(...pages.map(p => Math.max(...p.daily, 0)), 1)
  return pages.map(p => {
    const today = new Date().toISOString().split('T')[0]
    const bars = p.daily.map((c, i) => {
      const ht = Math.max((c / max) * 22, 2)
      const isToday = i === p.daily.length - 1
      return `<div class="${isToday ? 'sel' : ''}" style="height:${ht}px"></div>`
    }).join('')
    const cls = p.change > 0 ? 'pos' : p.change < 0 ? 'neg' : 'zero'
    const arrow = p.change > 0 ? '▲' : p.change < 0 ? '▼' : '–'
    const label = p.change !== 0 ? Math.abs(p.change) + '%' : ''
    return `
      <div class="page-row">
        <div class="sparkline">${bars}</div>
        <span class="page-count">${p.count}</span>
        <span class="page-change ${cls}">${arrow} ${label}</span>
        <div class="page-info">
          <span class="page-path">${esc(p.path)}</span>
          <span class="page-title">${esc(p.title)}</span>
        </div>
      </div>
    `
  }).join('')
}

function renderChart(days) {
  if (!days || days.length === 0) return '<p class="empty">No data yet</p>'
  const max = Math.max(...days.map(d => d.count), 1)
  return '<div class="chart-wrap">' + days.map(d => {
    const pct = (d.count / max) * 100
    return `
      <div class="chart-row">
        <span class="chart-label">${d.label}</span>
        <div class="chart-bar-track"><div class="chart-bar" style="width:${pct}%"></div></div>
        <span class="chart-value">${d.count}</span>
      </div>
    `
  }).join('') + '</div>'
}

function renderTable(items) {
  if (!items || items.length === 0) return '<p class="empty">No data yet</p>'
  return items.map(item => `
    <div class="table-row">
      <span class="table-name">${esc(item.name || item.source || item.range || '')}</span>
      <span class="table-count">${item.count.toLocaleString()}</span>
    </div>
  `).join('')
}

function renderRecent(views) {
  if (!views || views.length === 0) return '<p class="empty">No data yet</p>'
  return views.map(v => {
    const badge = v.event
      ? '<span class="recent-badge">event</span>'
      : '<span class="recent-clear">view</span>'
    const extra = [v.browser, v.os].filter(Boolean).join(' · ') || '—'
    return `
      <div class="recent-item">
        <span class="recent-path">${esc(v.path)}</span>
        <span class="recent-title">${esc(v.title)}</span>
        <span class="recent-meta">
          <span>${esc(v.referrer)}</span>
          <span class="recent-time">${timeAgo(v.time)}</span>
        </span>
        <span class="recent-extras">${extra} ${badge}</span>
      </div>
    `
  }).join('')
}

function updateDashboard(data) {
  els.totalViews.textContent = data.totalViews.toLocaleString()
  els.todayViews.textContent = data.todayViews.toLocaleString()
  els.uniqueVisitors.textContent = data.uniqueVisitors.toLocaleString()
  els.eventCount.textContent = data.eventCount.toLocaleString()
  els.botCount.textContent = data.botCount.toLocaleString()
  els.topPages.innerHTML = renderPages(data.topPages, els.pagesSubtitle)
  els.viewsOverTime.innerHTML = renderChart(data.viewsOverTime)
  els.topReferrers.innerHTML = renderTable(data.topReferrers)
  els.browsers.innerHTML = renderTable(data.browsers)
  els.systems.innerHTML = renderTable(data.systems)
  els.languages.innerHTML = renderTable(data.languages)
  els.screenSizes.innerHTML = renderTable(data.screenSizes)
  els.recentViews.innerHTML = renderRecent(data.recentViews)
  els.lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleTimeString()
}

async function fetchStats() {
  setStatus('loading')
  try {
    const res = await fetch(API)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    updateDashboard(data)
    setStatus('connected')
  } catch (err) {
    console.error('SheepCounter: fetch failed', err)
    setStatus('error')
  }
}

fetchStats()
setInterval(fetchStats, POLL_INTERVAL)
