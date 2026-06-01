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

function parseUA(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown' }
  let browser = 'Other'
  if (/Chrome/i.test(ua) && !/Edg|Edge/i.test(ua)) browser = 'Chrome'
  else if (/Firefox/i.test(ua)) browser = 'Firefox'
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari'
  else if (/Edg|Edge/i.test(ua)) browser = 'Edge'
  else if (/OPR|Opera/i.test(ua)) browser = 'Opera'

  let os = 'Other'
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Mac OS/i.test(ua)) os = 'macOS'
  else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = 'Linux'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS'

  return { browser, os }
}

function parseLang(accept) {
  if (!accept) return 'en'
  return accept.split(',')[0].split(';')[0].split('-')[0]
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers }
  }

  const q = event.queryStringParameters || {}
  const ua = event.headers['user-agent'] || event.headers['User-Agent'] || ''
  const al = event.headers['accept-language'] || event.headers['Accept-Language'] || ''
  const { browser, os } = parseUA(ua)

  try {
    const db = getClient()
    await db.execute({
      sql: `INSERT INTO hits (path, referrer, title, event, screen_width, bot, query_string, time, browser, os, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        q.p || '/',
        q.r || '',
        q.t || '',
        q.e === 'true' ? 1 : 0,
        parseInt(q.s) || 0,
        parseInt(q.b) || 0,
        q.q || '',
        new Date().toISOString(),
        browser,
        os,
        parseLang(al),
      ],
    })

    return { statusCode: 204, headers, body: '' }
  } catch (err) {
    console.error('SheepCounter count error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
