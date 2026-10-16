/**
 * Relay for the Filmix app API used by the Lampa plugin.
 *
 * Filmix returns empty player_links to any browser User-Agent ("Mozilla", "Chrome"), and Lampa
 * (browser / TV / Android WebView) can't change it, so requests go through here with an app UA.
 * It also gives https + CORS for Lampa opened over https.
 *
 * Runs as a Cloudflare Worker (export default { fetch }) or under Node 18+ via ./server.js.
 *
 * API (only these two methods are relayed):
 *   GET /filmix/search?story=<query>&<user_dev params>[&token=<secret>]
 *   GET /filmix/post/<id>?<user_dev params>[&token=<secret>]
 *
 * Env (optional):
 *   FILMIX_API  - default http://filmixapp.cyou/api/v2/
 *   TOKEN       - if set, requests must pass ?token=<TOKEN>
 */

const DEFAULT_API = 'http://filmixapp.cyou/api/v2/'
const ALLOWED = /^(search|post\/\d+)$/

export default {
    async fetch(request, env) {
        try {
            return await handle(request, env || {})
        }
        catch (e) {
            return json({ error: String(e && e.message || e) }, 502)
        }
    }
}

export async function handle(request, env) {
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }))

    const url = new URL(request.url)

    if (env.TOKEN && url.searchParams.get('token') !== env.TOKEN) {
        return json({ error: 'forbidden' }, 403)
    }

    const method = url.pathname.replace(/^\/filmix\/?/, '')

    if (!url.pathname.startsWith('/filmix/') || !ALLOWED.test(method)) {
        return json({ error: 'not found' }, 404)
    }

    const params = new URLSearchParams(url.search)

    params.delete('token')

    const api = (env.FILMIX_API || DEFAULT_API).replace(/\/*$/, '/')
    const res = await fetch(api + method + '?' + params.toString(), {
        headers: { 'User-Agent': 'okhttp/4.9.0', 'Accept': 'application/json' }
    })

    return withCors(new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    }))
}

function withCors(res) {
    res.headers.set('Access-Control-Allow-Origin', '*')
    res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', '*')

    return res
}

function json(data, status) {
    return withCors(new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    }))
}
