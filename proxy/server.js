// Local / VPS runner for worker.js (Node 18+): node proxy/server.js
// Env: PORT (default 8787), TOKEN, ZETFLIX_BASE
import http from 'node:http'
import worker from './worker.js'

const port = parseInt(process.env.PORT || '8787', 10)

http.createServer(async (req, res) => {
    const request = new Request('http://localhost' + req.url, { method: req.method })
    const response = await worker.fetch(request, process.env)

    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
}).listen(port, () => {
    console.log('zetflix proxy on http://localhost:' + port + '/?kp=301')
})
