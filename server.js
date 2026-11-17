// Dependency-free local server for the ETF dashboard and Naver's EUC-KR feed.
// Run: node server.js
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const SOURCE_URL = 'https://finance.naver.com/api/sise/etfItemList.nhn';
const MIN_FETCH_INTERVAL_MS = 15_000;
const assets = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8']
};

let snapshot = null;
let lastFetchAt = 0;
let inFlight = null;

async function fetchSnapshot(force = false) {
  if (snapshot && !force && Date.now() - lastFetchAt < MIN_FETCH_INTERVAL_MS) {
    return { ...snapshot, stale: false };
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch(SOURCE_URL, {
        signal: AbortSignal.timeout(15_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ETF-EDA/1.0)',
          Accept: 'application/json,text/plain,*/*',
          Referer: 'https://finance.naver.com/sise/etf.naver'
        }
      });
      if (!response.ok) throw new Error(`네이버 금융 응답: HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const payload = JSON.parse(new TextDecoder('euc-kr').decode(buffer));
      const items = payload?.result?.etfItemList;
      if (payload?.resultCode !== 'success' || !Array.isArray(items)) {
        throw new Error('ETF 목록 응답 형식이 예상과 다릅니다.');
      }
      snapshot = { items, fetched_at: new Date().toISOString(), source: SOURCE_URL };
      lastFetchAt = Date.now();
      return { ...snapshot, stale: false };
    } catch (error) {
      if (snapshot) return { ...snapshot, stale: true, error: String(error.message || error) };
      throw new Error(`네이버 ETF 정보를 가져오지 못했습니다: ${error.message || error}`);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET') {
    response.writeHead(405, { Allow: 'GET' });
    response.end();
    return;
  }
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/api/etfs') {
    try {
      sendJson(response, 200, await fetchSnapshot(url.searchParams.get('refresh') === '1'));
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }
  const asset = assets[url.pathname];
  if (!asset) {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }
  try {
    const body = await fs.readFile(path.join(ROOT, asset[0]));
    response.writeHead(200, {
      'Content-Type': asset[1],
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    response.end(body);
  } catch (error) {
    sendJson(response, 500, { error: `파일을 읽지 못했습니다: ${error.message}` });
  }
});

server.listen(PORT, HOST, () => console.log(`ETF 대시보드: http://${HOST}:${PORT}`));
