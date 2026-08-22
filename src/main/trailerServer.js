import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

// YouTube's embedded player refuses to play when the embedding page has no
// HTTP referrer, which is exactly the case for a packaged build: main/index.js
// uses loadFile(), so the renderer's origin is file:// and Chromium sends no
// referrer at all. Measured in Electron 22 against a real file:// renderer:
//
//   plain <iframe> from file://            -> onError 153
//   + Referer injected via webRequest      -> onError 152
//   framed by a page served over http      -> plays (playerState 1)
//
// Header injection is not enough because the player reads document.referrer, a
// navigation property, rather than the request header. So the trailer is nested
// one level deeper: the renderer frames this loopback page, and this page frames
// YouTube - giving the embed a genuine http origin to inherit a referrer from.
//
// The whole server is one static route. It reads nothing from disk, touches no
// user data, and binds to 127.0.0.1 on an ephemeral port. A per-launch token is
// still required so another local process cannot drive it.

let server = null
// listen() is asynchronous - server.address() stays null until the 'listening'
// event fires - so the port has to be awaited rather than read straight after.
// Cached as a promise so concurrent callers share one server.
let startPromise = null
const token = randomBytes(16).toString('hex')

// Both nesting levels need the permission delegated - a policy the outer frame
// does not grant cannot be given to the inner one, however the inner one asks.
const FRAME_PERMISSIONS = 'autoplay; encrypted-media; fullscreen'

function page(videoKey) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Trailer</title>
<style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden}
  iframe{border:0;width:100%;height:100%;display:block}
  #fallback{display:none;height:100%;color:#e7e9ee;background:#111;
    font:15px/1.5 system-ui,Segoe UI,sans-serif;
    flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px}
  #fallback a{color:#bfc6ff}
</style></head>
<body>
<iframe id="player" allow="${FRAME_PERMISSIONS}" allowfullscreen
  src="https://www.youtube-nocookie.com/embed/${videoKey}?enablejsapi=1&autoplay=1&rel=0&modestbranding=1"></iframe>
<div id="fallback">
  <div>This trailer cannot be played inside the app.</div>
  <div>The video owner may have disabled embedding.</div>
  <a href="https://www.youtube.com/watch?v=${videoKey}" target="_blank" rel="noreferrer">Open on YouTube</a>
</div>
<script>
  var player = document.getElementById('player')
  var ready = false

  function showFallback() {
    player.style.display = 'none'
    document.getElementById('fallback').style.display = 'flex'
  }

  // The player reports embed refusals (153/150/101) through the same postMessage
  // channel it uses for state, so listening is the only way to tell a blocked
  // video from a black rectangle.
  window.addEventListener('message', function (e) {
    var data
    try { data = JSON.parse(e.data) } catch (_) { return }
    if (data.event === 'onReady') ready = true
    if (data.event === 'onError') showFallback()
  })

  player.onload = function () {
    player.contentWindow.postMessage(
      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')
  }

  // A player that never reports anything is just as broken as one that errors.
  setTimeout(function () { if (!ready) showFallback() }, 8000)
</script>
</body>
</html>`
}

function start() {
  if (startPromise) return startPromise

  startPromise = new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')

      if (url.pathname !== '/trailer' || url.searchParams.get('token') !== token) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not found')
        return
      }

      // Whitelisted rather than escaped: a YouTube id is [A-Za-z0-9_-], so
      // anything else is not an id and has no business being interpolated into
      // the page.
      const videoKey = (url.searchParams.get('v') || '').replace(/[^A-Za-z0-9_-]/g, '')
      if (!videoKey) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Missing video key')
        return
      }

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      })
      res.end(page(videoKey))
    })

    server.once('error', (error) => {
      startPromise = null
      reject(error)
    })

    server.listen(0, '127.0.0.1', () => {
      resolve(`http://127.0.0.1:${server.address().port}`)
    })
  })

  return startPromise
}

// Started lazily: a library that is never used to watch a trailer never opens a
// socket at all.
export async function getTrailerBase() {
  return { base: await start(), token }
}

export function stopTrailerServer() {
  if (!server) return
  server.close()
  server = null
  startPromise = null
}
