/*!
 * server.js — live polls for Transition.js decks
 *
 * The deck (poll.js) opens and closes questions; students vote from
 * server/s/<session> on their phones; every change is pushed to all
 * connected browsers with server-sent events. Everything is in memory:
 * a lecture does not need a database, and nothing personal is stored —
 * a random token per phone only prevents double voting.
 *
 * Environment:
 *   PORT       listening port (8080, what OpenShift expects)
 *   POLL_KEY   secret that the deck must present to open/close questions
 *   BASE_URL   public URL of this server, if it cannot be guessed from requests
 *
 * API (JSON, CORS enabled, all under /api/<session>/):
 *   GET  events            server-sent events: the state, then every change
 *   POST vote              { token, poll, choices: [indices] }
 *   POST open              { poll, question, options: [...], multiple }   (X-Poll-Key)
 *   POST close             { poll }                                        (X-Poll-Key)
 *   POST reset             {}  forget every poll of the session             (X-Poll-Key)
 *   GET  qr.svg            QR code of the vote page for this session
 *   GET  state.json        the state, for debugging
 *   GET  /s/<session>      the vote page
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 8080;
const KEY = process.env.POLL_KEY || '';
if (!KEY) console.warn('POLL_KEY is not set: anyone can open and close questions.');

const votePage = fs.readFileSync(path.join(__dirname, 'vote.html'));
const sessions = new Map();

function session(id) {
  if (!sessions.has(id)) sessions.set(id, { current: null, polls: new Map(), clients: new Set() });
  return sessions.get(id);
}

/** What everybody sees: the open question, and the counts of every poll. */
function state(s) {
  const polls = {};
  for (const [id, p] of s.polls) polls[id] = { counts: p.counts, total: p.votes.size };
  const cur = s.current && s.polls.get(s.current);
  return {
    current: cur ? { id: s.current, question: cur.question, options: cur.options, multiple: cur.multiple } : null,
    polls,
  };
}

function broadcast(s) {
  const data = 'event: state\ndata: ' + JSON.stringify(state(s)) + '\n\n';
  for (const res of s.clients) res.write(data);
}

function recount(p) {
  p.counts = p.options.map(() => 0);
  for (const choices of p.votes.values()) for (const i of choices) if (p.counts[i] !== undefined) p.counts[i]++;
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 20000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function baseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return proto + '://' + req.headers.host;
}

const clean = (s, max = 400) => String(s == null ? '' : s).slice(0, max);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Poll-Key',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  // Vote page
  let m = url.pathname.match(/^\/s\/([\w.-]+)\/?$/);
  if (m && req.method === 'GET') return send(res, 200, votePage, 'text/html');
  if (url.pathname === '/' ) return send(res, 200, 'Transition.js poll server. Vote pages are at /s/<session>.', 'text/plain');

  // API
  m = url.pathname.match(/^\/api\/([\w.-]+)\/(events|vote|open|close|reset|qr\.svg|state\.json)$/);
  if (!m) return send(res, 404, { error: 'not found' });
  const s = session(m[1]);
  const action = m[2];

  try {
    if (action === 'events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('event: state\ndata: ' + JSON.stringify(state(s)) + '\n\n');
      s.clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); s.clients.delete(res); });
      return;
    }

    if (action === 'state.json') return send(res, 200, state(s));

    if (action === 'qr.svg') {
      const svg = await QRCode.toString(baseUrl(req) + '/s/' + m[1], { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      return send(res, 200, svg, 'image/svg+xml');
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const body = await readJSON(req);

    if (action === 'vote') {
      const p = s.polls.get(body.poll);
      if (!p || s.current !== body.poll) return send(res, 409, { error: 'closed' });
      const token = clean(body.token, 64);
      if (!token) return send(res, 400, { error: 'token' });
      let choices = Array.isArray(body.choices) ? body.choices.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < p.options.length) : [];
      choices = [...new Set(choices)];
      if (!p.multiple) choices = choices.slice(0, 1);
      if (!choices.length) return send(res, 400, { error: 'choices' });
      p.votes.set(token, choices);          // a new vote from the same phone replaces the old one
      recount(p);
      broadcast(s);
      return send(res, 200, { ok: true, choices });
    }

    // Presenter actions
    if (KEY && req.headers['x-poll-key'] !== KEY) return send(res, 403, { error: 'key' });

    if (action === 'open') {
      const id = clean(body.poll, 64);
      if (!id) return send(res, 400, { error: 'poll' });
      const options = (Array.isArray(body.options) ? body.options : []).slice(0, 12).map((o) => clean(o));
      if (options.length < 2) return send(res, 400, { error: 'options' });
      let p = s.polls.get(id);
      if (!p) { p = { votes: new Map() }; s.polls.set(id, p); }
      p.question = clean(body.question); p.options = options; p.multiple = !!body.multiple;
      recount(p);
      s.current = id;
      broadcast(s);
      return send(res, 200, { ok: true });
    }

    if (action === 'reset') {
      s.polls.clear(); s.current = null;
      broadcast(s);
      return send(res, 200, { ok: true });
    }

    if (action === 'close') {
      if (!body.poll || s.current === body.poll) s.current = null;
      broadcast(s);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 400, { error: String(e.message || e) });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log('poll server listening on port ' + PORT));
