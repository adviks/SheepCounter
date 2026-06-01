# SheepCounter

Privacy-friendly web analytics. Inspired from [GoatCounter](https://www.goatcounter.com/).

No cookies, no personal data tracking. Just page views, referrers, browsers, systems, screen sizes, and more.

## Features

- **Tracker script** — drop-in `<script>` tag for any site (~3 KB gzipped)
- **Live dashboard** — auto-polling stats with pages, referrers, browsers, OS, languages, screen sizes
- **Serverless backend** — data stored in [Turso](https://turso.tech/) (serverless SQLite), deployed as [Netlify Functions](https://www.netlify.com/products/functions/)
- **Self-hosted** — full control over your analytics data
- **Click tracking** — track button clicks and custom events
- **Bot detection** — automatic filtering of known bots

## Project structure

```
sheepcounter/
├── sheepcounter.js        Tracker script — drop this on your site
├── index.html             Live dashboard
├── dashboard.css          Dashboard styles
├── dashboard.js           Dashboard logic
├── netlify/
│   └── functions/
│       ├── count.js       Records page views (Turso)
│       ├── stats.js       Returns aggregated stats (Turso)
│       └── health.js      Health check
├── netlify.toml           Netlify deployment config
└── package.json
```

## Usage

### Add tracking to your site

```html
<script data-sheepcounter="https://your-site.netlify.app/count" src="sheepcounter.js" async></script>
```

Replace the URL with your deployed site domain.

### Track click events

```html
<button data-sheepcounter-click="signup-click">Sign Up</button>
```

Optional attributes: `data-sheepcounter-title`, `data-sheepcounter-referrer`, `data-sheepcounter-no-session`.

### Skip your own visits

Append `#toggle-sheepcounter` to the URL to pause/resume tracking in your browser.

## API

| Endpoint | Method | Description |
|---|---|---|
| `/count` | GET | Receive tracking data (called by tracker script) |
| `/api/sheepcounter/stats` | GET | Aggregated stats for the dashboard |
| `/health` | GET | Health check (`{ status: "ok" }`) |

The `/count` endpoint accepts the following query parameters sent by the tracker:

| Param | Source | Description |
|---|---|---|
| `p` | Tracker | Page path |
| `r` | Tracker | Referrer |
| `t` | Tracker | Page title |
| `e` | Tracker | Event flag (`true`/`false`) |
| `s` | Tracker | Screen width in pixels |
| `b` | Tracker | Bot score (0 if human) |
| `q` | Tracker | Query string |
| *(header)* | Browser | User-Agent (parsed for browser + OS) |
| *(header)* | Browser | Accept-Language (parsed for language) |

## Deployment

### Netlify + Turso (recommended)

Deploy the dashboard, tracker script, and API functions all to Netlify for free.

1. **Create a Turso database**

   ```bash
   # Install the Turso CLI
   curl -sSfL https://get.turso.tech/install.sh | bash

   # Log in and create a database
   turso auth login
   turso db create sheepcounter

   # Get the database URL and auth token
   turso db show sheepcounter --url
   turso db tokens create sheepcounter
   ```

2. **Create the schema**

   ```bash
   turso db shell sheepcounter <<SQL
   CREATE TABLE hits (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     path TEXT NOT NULL DEFAULT '/',
     referrer TEXT DEFAULT '',
     title TEXT DEFAULT '',
     event INTEGER DEFAULT 0,
     screen_width INTEGER DEFAULT 0,
     bot INTEGER DEFAULT 0,
     query_string TEXT DEFAULT '',
     time TEXT NOT NULL,
     browser TEXT DEFAULT 'Unknown',
     os TEXT DEFAULT 'Unknown',
     lang TEXT DEFAULT 'en'
   );
   SQL
   ```

3. **Deploy to Netlify**

   Fork or clone this repo and connect it to [Netlify](https://app.netlify.com/).

   Set the following environment variables in the Netlify dashboard:

   ```
   TURSO_DB_URL=https://your-db.turso.io
   TURSO_DB_AUTH_TOKEN=your-auth-token
   ```

   Build settings:
   - Build command: *(none)*
   - Publish directory: `.`

4. **Done!**

   Your dashboard will be at `https://your-site.netlify.app`.

   Add tracking to any site with:

   ```html
   <script data-sheepcounter="https://your-site.netlify.app/count" src="https://your-site.netlify.app/sheepcounter.js" async></script>
   ```

### Dashboard API endpoint

The dashboard auto-detects the API endpoint in this order:

1. `?api=` URL parameter (e.g. `index.html?api=https://api.example.com/stats`)
2. `data-api` attribute on the dashboard script tag
3. Defaults to `/api/sheepcounter/stats` (same origin)

## Development

```bash
npm install
npx netlify dev
```

This runs the dashboard and functions locally on port 8888. No separate API server or JSONL file needed.

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).
