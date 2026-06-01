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

function getDays(n) {
  const days = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    days.push(d)
  }
  return days
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

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayHits = hits.filter(h => new Date(h.time) >= today)
    const uniqueKeys = new Set(hits.map(h => `${h.path}:${h.screenWidth}`))

    const eventCount = hits.filter(h => h.event).length
    const botCount = hits.filter(h => h.bot > 0).length

    const days = getDays(7)
    const viewsOverTime = days.map(d => {
      const end = new Date(d)
      end.setDate(end.getDate() + 1)
      return {
        date: d.toISOString().split('T')[0],
        count: countInRange(hits, d, end),
        label: d.toLocaleDateString('en', { weekday: 'short' }),
      }
    })

    const pageCounts = {}
    const pageHits = {}
    hits.forEach(h => {
      pageCounts[h.path] = (pageCounts[h.path] || 0) + 1
      if (!pageHits[h.path]) pageHits[h.path] = []
      pageHits[h.path].push(h)
    })
    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([path, count]) => {
        const ph = pageHits[path]
        const daily = days.map(d => {
          const end = new Date(d)
          end.setDate(end.getDate() + 1)
          return ph.filter(h => { const t = new Date(h.time); return t >= d && t < end }).length
        })
        const cur = daily.slice(-3).reduce((a, b) => a + b, 0)
        const prev = daily.slice(0, 4).reduce((a, b) => a + b, 0)
        const change = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0
        const title = ph.find(h => h.title)?.title || ''
        return { path, count, change, daily, title }
      })

    const refCounts = {}
    hits.forEach(h => {
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

    const screenGroups = { '≤639': 0, '640–1023': 0, '1024–1439': 0, '1440+': 0 }
    hits.forEach(h => {
      const w = h.screenWidth
      if (w < 640) screenGroups['≤639']++
      else if (w < 1024) screenGroups['640–1023']++
      else if (w < 1440) screenGroups['1024–1439']++
      else screenGroups['1440+']++
    })
    const screenSizes = Object.entries(screenGroups)
      .filter(([_, c]) => c > 0)
      .map(([range, count]) => ({ name: range, count }))

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalViews: hits.length,
        uniqueVisitors: uniqueKeys.size,
        todayViews: todayHits.length,
        eventCount,
        botCount,
        viewsOverTime,
        topPages,
        topReferrers,
        browsers: group(hits, 'browser'),
        systems: group(hits, 'os'),
        languages: group(hits, 'lang'),
        screenSizes,
        recentViews: hits.slice(-25).reverse().map(h => ({
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
