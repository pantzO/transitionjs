// Renders the examples in headless Chromium and writes PNGs in test/shots/.
// @sparticuz/chromium ships its own Chromium; a locally installed Chrome
// can be used instead: CHROME=/usr/bin/google-chrome npm run screenshots
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const base = 'file://' + path.resolve(__dirname, '../examples') + '/';
const out = path.join(__dirname, 'shots');

(async () => {
  let executablePath = process.env.CHROME, args = [];
  if (!executablePath) {
    const chromium = require('@sparticuz/chromium');
    const c = chromium.default || chromium;
    executablePath = await c.executablePath(); args = c.args;
  }
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath, args, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'warning') console.log('warning:', m.text()); });
  const shot = (name) => page.screenshot({ path: path.join(out, name + '.png') });
  const key = async (k, ms = 800) => { await page.keyboard.press(k); await wait(ms); };

  await page.goto(base + 'beamer.html#transitions'); await wait(500);
  await shot('beamer-part-title');
  await key('ArrowDown'); await key('ArrowDown', 1800); await shot('beamer-step');
  await key('Escape', 400); await shot('beamer-overview'); await key('Escape', 400);

  await page.goto(base + 'fade.html'); await key(' ', 1200); await key(' ', 1200); await shot('fade');
  await page.goto(base + 'minimal.html'); await key(' '); await key(' '); await shot('minimal');
  await page.goto(base + 'newton/newton.html').catch(() => {}); await wait(2500);
  await page.evaluate(() => TransitionJS.deck.goTo(10)); await wait(300); await shot('newton-convergence');
  await page.evaluate(() => TransitionJS.deck.goTo(15)); await wait(300); await shot('newton-bilan');
  await page.goto(base + 'tour.html').catch(() => {}); await wait(1500);
  await page.evaluate(() => TransitionJS.deck.goToSlide(12)); await key(' ', 3500); await shot('tour-graph');
  await key('Escape', 400); await shot('tour-overview');

  await browser.close();
  console.log('screenshots written to', out);
})().catch((e) => { console.error(e); process.exit(1); });
