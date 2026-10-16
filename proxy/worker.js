/**
 * Zetflix proxy for the Lampa plugin.
 *
 * Runs as a Cloudflare Worker (export default { fetch }) or under Node 18+ via ./server.js.
 *
 * Zetflix serves a JS challenge before the real player page:
 *   1. GET  /iplayer/videodb.php?kp=ID      -> obfuscated script, `window.token = "<40 hex>"`, PHPSESSID cookie
 *   2. POST same url, Authorization: Bearer <token>, body hash=sha1(md5(token + ';' + hostname + ';' + userAgent))
 *   3. GET  same url (same cookie)           -> page with `new Playerjs({ file: [...] })`
 * A Referer from the zetflix host is required, otherwise the server answers "Это видео удалено".
 *
 * API:
 *   GET /?kp=<kinopoisk id>[&season=<n>][&token=<secret>]
 *   -> { ok, kp, title, type: 'movie'|'serial', season, voices: [...] }
 *      movie:  voices = [{ name, qualities: { '1080p': url, ... } }]
 *      serial: voices = [{ name, episodes: [{ episode, qualities }] }]
 *
 * Env (optional):
 *   ZETFLIX_BASE  - entry host, default https://hdi.zetflix.online (it redirects to the current mirror)
 *   TOKEN         - if set, requests must pass ?token=<TOKEN>
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const DEFAULT_BASE = 'https://hdi.zetflix.online'
const CHALLENGE_ATTEMPTS = 2

export default {
    async fetch(request, env) {
        try {
            return await handle(request, env || {})
        }
        catch (e) {
            return json({ ok: false, error: String(e && e.message || e) }, 502)
        }
    }
}

export async function handle(request, env) {
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }))

    const url = new URL(request.url)

    if (env.TOKEN && url.searchParams.get('token') !== env.TOKEN) {
        return json({ ok: false, error: 'forbidden' }, 403)
    }

    const kp = url.searchParams.get('kp') || ''
    const season = url.searchParams.get('season') || ''

    if (!/^\d+$/.test(kp)) return json({ ok: false, error: 'kp param required' }, 400)
    if (season && !/^\d+$/.test(season)) return json({ ok: false, error: 'bad season' }, 400)

    const base = (env.ZETFLIX_BASE || DEFAULT_BASE).replace(/\/+$/, '')
    const target = base + '/iplayer/videodb.php?kp=' + kp + (season ? '&season=' + season : '')

    const html = await loadPage(target)
    const result = parsePage(html)

    result.kp = kp
    result.season = season ? parseInt(season, 10) : null

    return json(result, 200)
}

/* ---------------- network ---------------- */

async function loadPage(target) {
    const jar = {}
    let referer = new URL(target).origin + '/'

    let res = await request(target, { jar, referer })

    // the entry host redirects to the current mirror; the challenge hash is bound to that hostname
    const pageUrl = res.url || target
    const host = new URL(pageUrl).hostname

    referer = 'https://' + host + '/'

    let html = await res.text()

    for (let i = 0; i < CHALLENGE_ATTEMPTS && isChallenge(html); i++) {
        const token = extractToken(html)

        if (!token) throw new Error('challenge token not found')

        const hash = await sha1Hex(md5Hex(token + ';' + host + ';' + USER_AGENT))

        await request(pageUrl, {
            jar,
            referer,
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'hash=' + hash
        })

        res = await request(pageUrl, { jar, referer })
        html = await res.text()
    }

    if (isChallenge(html)) throw new Error('challenge not passed')

    return html
}

async function request(url, opts) {
    const headers = Object.assign({
        'User-Agent': USER_AGENT,
        'Referer': opts.referer,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9'
    }, opts.headers || {})

    const cookie = Object.keys(opts.jar).map(k => k + '=' + opts.jar[k]).join('; ')

    if (cookie) headers['Cookie'] = cookie

    const res = await fetch(url, {
        method: opts.method || 'GET',
        headers,
        body: opts.body,
        redirect: 'follow'
    })

    storeCookies(res.headers, opts.jar)

    return res
}

function storeCookies(headers, jar) {
    let list = []

    if (typeof headers.getSetCookie === 'function') list = headers.getSetCookie()
    else if (headers.get('set-cookie')) list = headers.get('set-cookie').split(/,(?=\s*[^;,=\s]+=)/)

    list.forEach(line => {
        const pair = line.split(';')[0]
        const eq = pair.indexOf('=')

        if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
    })
}

/* ---------------- challenge ---------------- */

function isChallenge(html) {
    return html.indexOf('new Playerjs') === -1 && !!extractToken(html)
}

function extractToken(html) {
    // window[String["fromCharCode"](0x74,0x6f,0x6b,0x65,0x6e)] = String["fromCharCode"](0x..,...)
    const m = html.match(/\(0x74,0x6f,0x6b,0x65,0x6e\)\]\s*=\s*String\[["']fromCharCode["']\]\(([^)]+)\)/)

    if (m) {
        return m[1].split(',').map(c => String.fromCharCode(parseInt(c, 16))).join('')
    }

    const plain = html.match(/window\.token\s*=\s*["']([0-9a-f]{32,64})["']/)

    return plain ? plain[1] : ''
}

/* ---------------- parsing ---------------- */

export function parsePage(html) {
    if (/^\s*video_not_found|Это видео удалено|Removed this video/i.test(html) && html.indexOf('new Playerjs') === -1) {
        return { ok: false, error: 'not_found' }
    }

    if (/^\s*ERROR/.test(html)) return { ok: false, error: html.trim().slice(0, 200) }

    const start = html.indexOf('new Playerjs')

    if (start === -1) return { ok: false, error: 'player not found' }

    const titleMatch = html.match(/<title>([^<]*)<\/title>/i)
    const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : ''

    const fileAt = html.slice(start).search(/\bfile\s*:/)

    if (fileAt === -1) return { ok: false, error: 'playlist not found' }

    let pos = start + fileAt
    pos = html.indexOf(':', pos) + 1

    while (/\s/.test(html[pos])) pos++

    let playlist

    if (html[pos] === '[') {
        playlist = JSON.parse(extractArray(html, pos))
    }
    else if (html[pos] === '"' || html[pos] === "'") {
        const quote = html[pos]
        const end = html.indexOf(quote, pos + 1)

        playlist = [{ title: '', file: html.slice(pos + 1, end) }]
    }
    else return { ok: false, error: 'unknown playlist format' }

    const isSerial = playlist.some(item => Array.isArray(item.folder))

    return isSerial
        ? { ok: true, title, type: 'serial', voices: normalizeSerial(playlist) }
        : { ok: true, title, type: 'movie', voices: normalizeMovie(playlist) }
}

/**
 * Cut a JS array literal starting at `pos` and drop trailing commas (Playerjs config has `},]`).
 */
function extractArray(src, pos) {
    let out = ''
    let depth = 0
    let quote = ''
    let escaped = false

    for (let i = pos; i < src.length; i++) {
        const ch = src[i]

        if (quote) {
            out += ch

            if (escaped) escaped = false
            else if (ch === '\\') escaped = true
            else if (ch === quote) quote = ''

            continue
        }

        if (ch === '"') {
            quote = ch
            out += ch
            continue
        }

        if (ch === ']' || ch === '}') out = out.replace(/,\s*$/, '')

        out += ch

        if (ch === '[' || ch === '{') depth++
        else if (ch === ']' || ch === '}') {
            depth--

            if (depth === 0) return out
        }
    }

    throw new Error('unterminated playlist')
}

function normalizeMovie(playlist) {
    const voices = []

    playlist.forEach(item => {
        const qualities = parseQualities(item.file)

        if (Object.keys(qualities).length) {
            voices.push({ name: uniqueName(voices, item.title || 'Оригинал'), qualities })
        }
    })

    return voices
}

/**
 * Season page is a flat list: [{ title: voice, folder: [{ comment: 'N серия', file }] }, ...].
 * The same voice name can show up twice with different files (mp4 / hls variants),
 * so the n-th occurrence of a name inside one episode goes to the n-th voice with that name.
 */
function normalizeSerial(playlist) {
    const voices = []
    const byKey = {}
    const seen = {}

    playlist.forEach(item => {
        (item.folder || []).forEach(ep => {
            const episode = parseInt(ep.comment, 10) || 0
            const name = item.title || 'Оригинал'
            const seenKey = episode + '|' + name
            const occurrence = seen[seenKey] = (seen[seenKey] || 0) + 1
            const key = name + '#' + occurrence

            if (!byKey[key]) {
                byKey[key] = { name: occurrence > 1 ? name + ' (' + occurrence + ')' : name, episodes: [] }
                voices.push(byKey[key])
            }

            const qualities = parseQualities(ep.file)

            if (Object.keys(qualities).length) {
                byKey[key].episodes.push({ episode, title: ep.title || ep.comment || '', qualities })
            }
        })
    })

    voices.forEach(v => v.episodes.sort((a, b) => a.episode - b.episode))

    return voices.filter(v => v.episodes.length)
}

function parseQualities(file) {
    const qualities = {}

    String(file || '').split(/,(?=\[)/).forEach(part => {
        const m = part.trim().match(/^\[([^\]]*)\]\s*(.+)$/)
        const label = m ? (m[1] || 'auto') : 'auto'
        const link = (m ? m[2] : part).split(' or ')[0].trim()

        if (/^https?:\/\//.test(link)) qualities[label] = link
    })

    return qualities
}

function uniqueName(list, name) {
    let result = name
    let n = 2

    while (list.some(v => v.name === result)) result = name + ' (' + (n++) + ')'

    return result
}

function decodeEntities(str) {
    return str.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/* ---------------- http helpers ---------------- */

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

/* ---------------- hashing ---------------- */

async function sha1Hex(str) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str))

    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// WebCrypto has no MD5 (outside Cloudflare), so a small implementation over UTF-8 bytes.
export function md5Hex(str) {
    const bytes = new TextEncoder().encode(str)
    const len = bytes.length
    const words = new Uint32Array((((len + 8) >>> 6) + 1) * 16)

    for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8)

    words[len >> 2] |= 0x80 << ((len % 4) * 8)
    words[words.length - 2] = len * 8

    const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
    const K = new Uint32Array(64)

    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)

    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476

    for (let off = 0; off < words.length; off += 16) {
        let a = a0, b = b0, c = c0, d = d0

        for (let i = 0; i < 64; i++) {
            let f, g
            const round = i >> 4

            if (round === 0) { f = (b & c) | (~b & d); g = i }
            else if (round === 1) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16 }
            else if (round === 2) { f = b ^ c ^ d; g = (3 * i + 5) % 16 }
            else { f = c ^ (b | ~d); g = (7 * i) % 16 }

            const tmp = d
            const sum = (a + f + K[i] + words[off + g]) | 0
            const s = S[round * 4 + (i % 4)]

            d = c
            c = b
            b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0
            a = tmp
        }

        a0 = (a0 + a) | 0
        b0 = (b0 + b) | 0
        c0 = (c0 + c) | 0
        d0 = (d0 + d) | 0
    }

    return [a0, b0, c0, d0].map(n => {
        let hex = ''

        for (let i = 0; i < 4; i++) hex += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')

        return hex
    }).join('')
}
