const { createClient } = require('@libsql/client')

let client
function getClient() {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DB_URL,
      authToken: process.env.TURSO_DB_AUTH_TOKEN,
    })
  }
  return client
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
}

const API_KEY = process.env.STATS_API_KEY

function parseRange(str) {
  if (str === '24h') return '24h'
  if (str === '30d') return '30d'
  if (str === 'all') return 'all'
  return '7d'
}

function filterByRange(hits, range) {
  const now = new Date()
  if (range === '24h') {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    return hits.filter(h => new Date(h.time) >= cutoff)
  }
  if (range === '7d') {
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    return hits.filter(h => new Date(h.time) >= cutoff)
  }
  if (range === '30d') {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    return hits.filter(h => new Date(h.time) >= cutoff)
  }
  return hits
}

function buildPeriods(hits, range) {
  const now = new Date()
  const periods = []
  if (range === '24h') {
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now)
      d.setHours(d.getHours() - i, 0, 0, 0)
      periods.push({ date: d, spanMs: 60 * 60 * 1000 })
    }
  } else if (range === '7d') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      periods.push({ date: d, spanMs: 24 * 60 * 60 * 1000 })
    }
  } else if (range === '30d') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      periods.push({ date: d, spanMs: 24 * 60 * 60 * 1000 })
    }
  } else if (range === 'all') {
    if (!hits || hits.length === 0) return periods
    const oldest = new Date(hits[0].time)
    const totalDays = Math.ceil((now - oldest) / (24 * 60 * 60 * 1000))
    const stepDays = totalDays > 180 ? 30 : totalDays > 60 ? 7 : 1
    const numPeriods = Math.ceil(totalDays / stepDays)
    for (let i = numPeriods; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - (i * stepDays))
      d.setHours(0, 0, 0, 0)
      periods.push({ date: d, spanMs: stepDays * 24 * 60 * 60 * 1000 })
    }
  }
  return periods
}

function periodLabel(p, range) {
  const d = p.date
  if (range === '24h') {
    return d.getHours().toString().padStart(2, '0') + ':00'
  }
  if (range === 'all') {
    const days = p.spanMs / (24 * 60 * 60 * 1000)
    if (days >= 30) return d.toLocaleDateString('en', { month: 'short' })
    if (days >= 7) return (d.getMonth() + 1) + '/' + d.getDate()
    return (d.getMonth() + 1) + '/' + d.getDate()
  }
  if (range === '30d') {
    return (d.getMonth() + 1) + '/' + d.getDate()
  }
  return d.toLocaleDateString('en', { weekday: 'short' })
}

function countInRange(hits, start, end) {
  return hits.filter(h => {
    const t = new Date(h.time)
    return t >= start && t < end
  }).length
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers }
  }

  if (!API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured: STATS_API_KEY not set' }) }
  }

  const provided = event.queryStringParameters?.key || event.headers['x-api-key']
  if (!provided || provided !== API_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) }
  }

  try {
    const range = parseRange(event.queryStringParameters?.range)
    const db = getClient()
    const result = await db.execute('SELECT * FROM hits ORDER BY time ASC')
    const hits = result.rows.map(r => ({
      path: r.path,
      referrer: r.referrer || '',
      title: r.title || '',
      event: r.event === 1,
      screenWidth: r.screen_width,
      bot: r.bot,
      queryString: r.query_string || '',
      time: r.time,
      browser: r.browser || 'Unknown',
      os: r.os || 'Unknown',
      lang: r.lang || 'en',
    }))

    const filtered = filterByRange(hits, range)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayHits = hits.filter(h => new Date(h.time) >= today)
    const uniqueKeys = new Set(filtered.map(h => `${h.path}:${h.screenWidth}`))
    const eventCount = filtered.filter(h => h.event).length
    const botCount = filtered.filter(h => h.bot > 0).length

    // Views over time (period buckets)
    const periods = buildPeriods(hits, range)
    const viewsOverTime = periods.map(p => {
      const end = new Date(p.date.getTime() + p.spanMs)
      return {
        date: p.date.toISOString(),
        count: countInRange(filtered, p.date, end),
        label: periodLabel(p, range),
      }
    })

    // Top pages with sparklines
    const pageCounts = {}
    const pageHits = {}
    filtered.forEach(h => {
      pageCounts[h.path] = (pageCounts[h.path] || 0) + 1
      if (!pageHits[h.path]) pageHits[h.path] = []
      pageHits[h.path].push(h)
    })
    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([path, count]) => {
        const ph = pageHits[path]
        const daily = periods.map(p => {
          const end = new Date(p.date.getTime() + p.spanMs)
          return ph.filter(h => { const t = new Date(h.time); return t >= p.date && t < end }).length
        })
        const cur = daily.slice(-3).reduce((a, b) => a + b, 0)
        const prev = daily.slice(0, daily.length - 3).reduce((a, b) => a + b, 0)
        const change = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0
        const title = ph.find(h => h.title)?.title || ''
        return { path, count, change, daily, title }
      })

    // Top titles
    const titleCounts = {}
    filtered.forEach(h => {
      if (h.title) {
        titleCounts[h.title] = (titleCounts[h.title] || 0) + 1
      }
    })
    const topTitles = Object.entries(titleCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([title, count]) => ({ title, count }))

    // Referrer domains
    const domainCounts = {}
    filtered.forEach(h => {
      let domain = 'direct'
      if (h.referrer) {
        try {
          domain = new URL(h.referrer).hostname.replace(/^www\./, '')
        } catch (_) {
          domain = h.referrer
        }
      }
      domainCounts[domain] = (domainCounts[domain] || 0) + 1
    })
    const referrerDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([domain, count]) => ({ domain, count }))

    // Referrer URLs (raw, top 8)
    const refCounts = {}
    filtered.forEach(h => {
      const s = h.referrer || 'direct'
      refCounts[s] = (refCounts[s] || 0) + 1
    })
    const topReferrers = Object.entries(refCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([source, count]) => ({ source, count }))

    function group(hits, key) {
      const counts = {}
      hits.forEach(h => {
        const v = h[key] || 'Unknown'
        counts[v] = (counts[v] || 0) + 1
      })
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([name, count]) => ({ name, count }))
    }

    // Screen sizes
    const screenGroups = { '≤639': 0, '640–1023': 0, '1024–1439': 0, '1440+': 0 }
    filtered.forEach(h => {
      const w = h.screenWidth
      if (w < 640) screenGroups['≤639']++
      else if (w < 1024) screenGroups['640–1023']++
      else if (w < 1440) screenGroups['1024–1439']++
      else screenGroups['1440+']++
    })
    const screenSizes = Object.entries(screenGroups)
      .filter(([_, c]) => c > 0)
      .map(([range, count]) => ({ name: range, count }))

    // Device types
    let mobile = 0, tablet = 0, desktop = 0
    filtered.forEach(h => {
      const w = h.screenWidth
      if (w < 640) mobile++
      else if (w < 1024) tablet++
      else desktop++
    })
    const deviceTypes = []
    if (mobile > 0) deviceTypes.push({ name: 'Mobile', count: mobile })
    if (tablet > 0) deviceTypes.push({ name: 'Tablet', count: tablet })
    if (desktop > 0) deviceTypes.push({ name: 'Desktop', count: desktop })

    // Hourly activity (always 0-23, from filtered hits)
    const hourly = new Array(24).fill(0)
    filtered.forEach(h => {
      hourly[new Date(h.time).getHours()]++
    })
    const hourlyActivity = hourly.map((count, hour) => ({ hour, count }))

    // Search terms from query strings
    const searchParams = ['q', 's', 'search', 'query', 'term', 'keyword']
    const termCounts = {}
    filtered.forEach(h => {
      if (h.queryString) {
        const qs = new URLSearchParams(h.queryString)
        searchParams.forEach(param => {
          const val = qs.get(param)
          if (val) {
            const raw = val.trim()
            if (raw) {
              termCounts[raw] = (termCounts[raw] || 0) + 1
            }
          }
        })
      }
    })
    const searchTerms = Object.entries(termCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([term, count]) => ({ term, count }))

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalViews: filtered.length,
        uniqueVisitors: uniqueKeys.size,
        todayViews: todayHits.length,
        eventCount,
        botCount,
        range,
        viewsOverTime,
        topPages,
        topTitles,
        referrerDomains,
        topReferrers,
        hourlyActivity,
        deviceTypes,
        browsers: group(filtered, 'browser'),
        systems: group(filtered, 'os'),
        languages: group(filtered, 'lang'),
        screenSizes,
        searchTerms,
        recentViews: filtered.slice(-25).reverse().map(h => ({
          path: h.path,
          time: h.time,
          referrer: h.referrer || 'direct',
          title: h.title,
          event: h.event,
          screenWidth: h.screenWidth,
          browser: h.browser,
          os: h.os,
        })),
      }),
    }
  } catch (err) {
    console.error('SheepCounter stats error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
