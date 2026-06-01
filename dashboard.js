const POLL_INTERVAL = 60000
const LOGIN_PAGE = '/login.html'

const API = (() => {
  const url = new URL(location)
  if (url.searchParams.has('api')) return url.searchParams.get('api')
  const script = document.querySelector('script[src$="dashboard.js"]')
  if (script && script.dataset.api) return script.dataset.api
  return '/api/sheepcounter/stats'
})()

let currentRange = '7d'

function getKey() { return sessionStorage.getItem('sheepcounter_key') || '' }
function setKey(k) { sessionStorage.setItem('sheepcounter_key', k) }
function clearKey() { sessionStorage.removeItem('sheepcounter_key') }
function redirectLogin() { location.href = LOGIN_PAGE }

const $ = q => document.querySelector(q)
const $$ = q => document.querySelectorAll(q)

const els = {
  totalViews: $('#totalViews'),
  todayViews: $('#todayViews'),
  uniqueVisitors: $('#uniqueVisitors'),
  eventCount: $('#eventCount'),
  botCount: $('#botCount'),
  viewsOverTime: $('#viewsOverTime'),
  viewsSubtitle: $('#viewsSubtitle'),
  topPages: $('#topPages'),
  pagesSubtitle: $('#pagesSubtitle'),
  trafficSources: $('#trafficSources'),
  sourcesSubtitle: $('#sourcesSubtitle'),
  hourlyActivity: $('#hourlyActivity'),
  hourlySubtitle: $('#hourlySubtitle'),
  deviceTypes: $('#deviceTypes'),
  devicesSubtitle: $('#devicesSubtitle'),
  browsers: $('#browsers'),
  systems: $('#systems'),
  languages: $('#languages'),
  screenSizes: $('#screenSizes'),
  screensSubtitle: $('#screensSubtitle'),
  searchTerms: $('#searchTerms'),
  searchSubtitle: $('#searchSubtitle'),
  recentViews: $('#recentViews'),
  recentSubtitle: $('#recentSubtitle'),
  lastUpdated: $('#lastUpdated'),
}

function ago(iso) {
  const d = Date.now() - new Date(iso).getTime()
  const s = Math.floor(d / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return s + 's ago'
  const m = Math.floor(s / 60)
  if (m < 60) return m + 'm ago'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

function esc(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

function pct(a, b) {
  return b > 0 ? Math.round((a / b) * 100) : 0
}

function total(arr) {
  return arr.reduce((s, v) => s + v, 0)
}

// ── Bar chart (used by views over time, hourly activity) ──

function renderBars(data, labelKey, valueKey, maxVal) {
  if (!data || data.length === 0) return '<p class="empty">No data yet</p>'
  const mx = maxVal || Math.max(...data.map(d => d[valueKey]), 1)
  return '<div class="bar-chart">' + data.map(d => {
    const h = Math.max((d[valueKey] / mx) * 100, 1)
    return `<div class="bar-col"><div class="bar" style="height:${h}%"></div><span class="bar-label">${esc(String(d[labelKey]))}</span><span class="bar-val">${d[valueKey]}</span></div>`
  }).join('') + '</div>'
}

// ── Horizontal bar (for browsers, os, languages, screen sizes) ──

function renderHbars(items, totalCount) {
  if (!items || items.length === 0) return '<p class="empty">No data yet</p>'
  const mx = items[0].count
  return items.map(item => {
    const w = pct(item.count, mx)
    const p = totalCount > 0 ? pct(item.count, totalCount) + '%' : ''
    return `<div class="hbar"><span class="hbar-lbl">${esc(item.name)}</span><div class="hbar-trk"><div class="hbar-fill" style="width:${w}%"></div></div><span class="hbar-val">${item.count.toLocaleString()}</span><span class="hbar-pct">${p}</span></div>`
  }).join('')
}

// ── Top pages with sparkline ──

function renderPages(pages) {
  if (!pages || pages.length === 0) return '<p class="empty">No data yet</p>'
  const maxSpark = Math.max(...pages.map(p => Math.max(...p.daily, 0)), 1)
  return pages.map(p => {
    const bars = p.daily.map((c, i) => {
      const h = Math.max((c / maxSpark) * 24, 2)
      const cls = i === p.daily.length - 1 ? 'spark-sel' : ''
      return `<div class="spark-bar ${cls}" style="height:${h}px"></div>`
    }).join('')
    const cls = p.change > 0 ? 'chg-up' : p.change < 0 ? 'chg-dn' : 'chg-0'
    const arrow = p.change > 0 ? '▲' : p.change < 0 ? '▼' : '–'
    const label = p.change !== 0 ? Math.abs(p.change) + '%' : ''
    return `<div class="prow"><div class="spark">${bars}</div><span class="pcount">${p.count}</span><span class="pchg ${cls}">${arrow} ${label}</span><div class="pinfo"><span class="ppath">${esc(p.path)}</span><span class="ptitle">${esc(p.title)}</span></div></div>`
  }).join('')
}

// ── Traffic sources (referrer domains) ──

function renderSources(domains, totalCount) {
  if (!domains || domains.length === 0) return '<p class="empty">All direct traffic</p>'
  const mx = domains[0].count
  return domains.map(d => {
    const w = pct(d.count, mx)
    const p = totalCount > 0 ? pct(d.count, totalCount) + '%' : ''
    return `<div class="hbar"><span class="hbar-lbl">${esc(d.domain)}</span><div class="hbar-trk"><div class="hbar-fill src-fill" style="width:${w}%"></div></div><span class="hbar-val">${d.count.toLocaleString()}</span><span class="hbar-pct">${p}</span></div>`
  }).join('')
}

// ── Device types (pie-styled bars) ──

function renderDevices(types) {
  if (!types || types.length === 0) return '<p class="empty">No data yet</p>'
  const total = types.reduce((s, t) => s + t.count, 0)
  const colors = { Mobile: '#7db87d', Tablet: '#c1dac1', Desktop: '#3b6e3b' }
  return types.map(t => {
    const p = pct(t.count, total)
    const c = colors[t.name] || '#aaa'
    return `<div class="hbar"><span class="hbar-lbl"><span class="dev-dot" style="background:${c}"></span>${esc(t.name)}</span><div class="hbar-trk"><div class="hbar-fill" style="width:${p}%;background:${c}"></div></div><span class="hbar-val">${t.count.toLocaleString()}</span><span class="hbar-pct">${p}%</span></div>`
  }).join('')
}

// ── Search terms ──

function renderTerms(terms) {
  if (!terms || terms.length === 0) return '<p class="empty">No search traffic</p>'
  const mx = terms[0].count
  return terms.map(t => {
    const w = pct(t.count, mx)
    return `<div class="hbar"><span class="hbar-lbl">${esc(t.term)}</span><div class="hbar-trk"><div class="hbar-fill" style="width:${w}%"></div></div><span class="hbar-val">${t.count.toLocaleString()}</span></div>`
  }).join('')
}

// ── Recent views ──

function renderRecent(views) {
  if (!views || views.length === 0) return '<p class="empty">No data yet</p>'
  return views.map(v => {
    const badge = v.event ? '<span class="ev-badge">event</span>' : '<span class="vw-badge">view</span>'
    const meta = [v.browser, v.os].filter(Boolean).join(' · ') || '—'
    return `<div class="rrow"><span class="rpath">${esc(v.path)}</span><span class="rtitle">${esc(v.title)}</span><span class="rmeta"><span class="rref">${esc(v.referrer)}</span><span class="rtime">${ago(v.time)}</span></span><span class="rextra">${meta} ${badge}</span></div>`
  }).join('')
}

function updateDashboard(data) {
  els.totalViews.textContent = data.totalViews.toLocaleString()
  els.todayViews.textContent = data.todayViews.toLocaleString()
  els.uniqueVisitors.textContent = data.uniqueVisitors.toLocaleString()
  els.eventCount.textContent = data.eventCount.toLocaleString()
  els.botCount.textContent = data.botCount.toLocaleString()

  // Views over time
  const vt = data.viewsOverTime
  els.viewsOverTime.innerHTML = renderBars(vt, 'label', 'count')
  const vtSum = vt ? total(vt.map(d => d.count)) : 0
  els.viewsSubtitle.textContent = vtSum.toLocaleString() + ' in period'

  // Pages
  els.topPages.innerHTML = renderPages(data.topPages)
  const pageTotal = data.topPages ? data.topPages.reduce((s, p) => s + p.count, 0) : 0
  els.pagesSubtitle.textContent = pageTotal ? pageTotal.toLocaleString() + ' visits' : ''

  // Traffic sources
  els.trafficSources.innerHTML = renderSources(data.referrerDomains, data.totalViews)
  els.sourcesSubtitle.textContent = data.totalViews + ' total'

  // Hourly activity
  els.hourlyActivity.innerHTML = renderBars(data.hourlyActivity, 'hour', 'count')
  const hrSum = data.hourlyActivity ? total(data.hourlyActivity.map(h => h.count)) : 0
  els.hourlySubtitle.textContent = hrSum.toLocaleString() + ' total'
  // Fix hour labels: pad with 0
  els.hourlyActivity.querySelectorAll('.bar-label').forEach(el => {
    el.textContent = el.textContent.padStart(2, '0') + ':00'
  })

  // Devices
  els.deviceTypes.innerHTML = renderDevices(data.deviceTypes)
  const devSum = data.deviceTypes ? total(data.deviceTypes.map(d => d.count)) : 0
  els.devicesSubtitle.textContent = devSum.toLocaleString() + ' total'

  // Browsers, systems, languages
  els.browsers.innerHTML = renderHbars(data.browsers, data.totalViews)
  els.systems.innerHTML = renderHbars(data.systems, data.totalViews)
  els.languages.innerHTML = renderHbars(data.languages, data.totalViews)

  // Screen sizes
  els.screenSizes.innerHTML = renderHbars(data.screenSizes, data.totalViews)
  const scSum = data.screenSizes ? total(data.screenSizes.map(s => s.count)) : 0
  els.screensSubtitle.textContent = scSum.toLocaleString() + ' total'

  // Search terms
  els.searchTerms.innerHTML = renderTerms(data.searchTerms)
  els.searchSubtitle.textContent = (data.searchTerms ? data.searchTerms.length : 0) + ' terms'

  // Recent views
  els.recentViews.innerHTML = renderRecent(data.recentViews)
  els.recentSubtitle.textContent = (data.recentViews ? data.recentViews.length : 0) + ' views'

  els.lastUpdated.textContent = 'Updated: ' + new Date().toLocaleTimeString()
}

async function fetchStats() {
  const key = getKey()
  if (!key) { redirectLogin(); return }

  try {
    const url = new URL(API, location.origin)
    url.searchParams.set('range', currentRange)
    const res = await fetch(url.toString(), { headers: { 'X-API-Key': key } })
    if (res.status === 401) { clearKey(); redirectLogin(); return }
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    updateDashboard(data)
  } catch (err) {
    console.error('SheepCounter: fetch failed', err)
  }
}

// ── Period selector ──

const periodBtns = $$('.period-btn')
periodBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    periodBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    currentRange = btn.dataset.range
    fetchStats()
  })
})

// ── Setup URLs ──

const origin = location.origin
const setupEndpoint = $('#setupEndpoint')
const setupSrc = $('#setupSrc')
if (setupEndpoint) setupEndpoint.textContent = origin + '/count'
if (setupSrc) setupSrc.textContent = origin + '/sheepcounter.js'

fetchStats()
setInterval(fetchStats, POLL_INTERVAL)
