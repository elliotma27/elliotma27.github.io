const { chromium } = require('playwright');
const { createServer } = require('http');
const { readFileSync, mkdirSync } = require('fs');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, '.screenshots');
const PORT = 8000;
const URL  = `http://localhost:${PORT}`;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.pdf':  'application/pdf',
  '.ico':  'image/x-icon',
};

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
];

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : req.url);
      const ext = path.extname(filePath);
      try {
        const data = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

(async () => {
  mkdirSync(OUT, { recursive: true });

  const server = await startServer();
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    // Force all reveal elements visible (IntersectionObserver won't fire
    // for off-screen elements in a headless full-page screenshot)
    await page.evaluate(() => {
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    });

    await page.waitForTimeout(300);

    const file = path.join(OUT, `${vp.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`Saved ${file}`);

    await page.close();
  }

  await browser.close();
  server.close();
})();
