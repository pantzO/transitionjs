const { JSDOM } = require('jsdom');
const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../examples/beamer.html', 'utf8')
  .replace(/<script src="[^"]*"><\/script>/g, '');   // we inject the libs ourselves
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/beamer.html#transitions' });
const w = dom.window;
w.eval(fs.readFileSync(__dirname + '/../transition.js', 'utf8'));
w.eval(fs.readFileSync(__dirname + '/../tableofcontents.js', 'utf8'));
const TJ = w.TransitionJS;
const warnings = [];
w.console.warn = (...a) => warnings.push(a.join(' '));

// --- specificity
const S = (s) => Array.from(TJ.specificity(s));
assert.deepStrictEqual(S('#slides > *:not(:first-child)'), [1,1,0]);
assert.deepStrictEqual(S('#slides > h2:not(:first-child)'), [1,1,1]);
assert.deepStrictEqual(S('#slides > h2'), [1,0,1]);
assert.deepStrictEqual(S('section'), [0,0,1]);
assert.deepStrictEqual(S('#slides > :where(:not(:first-child))'), [1,0,0]);
assert.deepStrictEqual(S('a::before, .x .y'), [0,2,0]);
assert.deepStrictEqual(S('div[data-x="a b"]'), [0,1,1]);

// --- toc + deck
TJ.tableOfContents({ target: '#toc, .toc', parts: 'h2', sub: null });
const deck = TJ.init({
  rules: [
    { selector: '#slides > h2:not(:first-child)', fragments: '[slides]{--shift++} 0.6s +0[toc]{--current++} 0.6s' },
  ],
});
assert.strictEqual(deck.slides.length, 12, 'slides = direct children incl. h2');
const h2s = deck.slides.filter(s => s.tagName === 'H2');
assert.deepStrictEqual(Array.from(h2s.map(h => h.id)), ['dire-bonjour', 'transitions', 'navigation']);
assert.deepStrictEqual(Array.from(h2s.map(h => h.getAttribute('data-fragments'))), Array(3).fill('[slides]{--shift++} 0.6s +0[toc]{--current++} 0.6s'));
assert.strictEqual(deck.slides[1].getAttribute('data-fragments'), '[slides]{--shift++} 0.6s', 'default rule');
assert.strictEqual(deck.slides[0].hasAttribute('data-fragments'), false);
assert.ok(w.document.getElementById('toc').hasAttribute('data-tj-target'));
console.log('length', deck.length, 'starts', deck._start.join(','));
// starts: slide0=0, slide1 =1, slide2 =4 (1 shift + 2 hidden), ...
assert.deepStrictEqual(Array.from(deck._start.slice(0,4)), [0,1,4,5]);
// initial hash #transitions → slide index of that h2
const iTrans = deck.slides.indexOf(w.document.getElementById('transitions'));
assert.strictEqual(deck.slideIndex, iTrans, 'initial hash honoured');
assert.strictEqual(w.location.hash, '#transitions');
assert.strictEqual(deck.time, deck._start[iTrans]);

// --- navigation & hash
deck.goTo(0);
assert.strictEqual(w.location.hash, '#1');
assert.strictEqual(deck.slideIndex, 0);
deck.next(); assert.strictEqual(deck.slideIndex, 1); assert.strictEqual(w.location.hash, '#2');
deck.next(); deck.next(); // fragments inside slide 2 (index 1)
assert.strictEqual(deck.slideIndex, 1);
deck.next(); assert.strictEqual(deck.slideIndex, 2);
assert.ok(deck.slides[2].classList.contains('tj-current'));
assert.ok(deck.slides[1].classList.contains('tj-past'));
assert.ok(deck.slides[3].classList.contains('tj-future'));
// hidden toggles reversible
const span = w.document.querySelector('section:nth-child(2) span[data-fragments]');
deck.goTo(2); assert.ok(!span.classList.contains('hidden'));
deck.prev();  assert.ok(span.classList.contains('hidden'));
assert.strictEqual(span.style.getPropertyValue('--tj-duration'), '0.5s');
// user-driven hash change (id first, then index)
let events = 0; w.document.addEventListener('transitionjs:change', () => events++);
w.location.hash = '#navigation';
w.dispatchEvent(new w.Event('hashchange'));
assert.strictEqual(deck.slide.id, 'navigation');
w.location.hash = '#3'; w.dispatchEvent(new w.Event('hashchange'));
assert.strictEqual(deck.slideIndex, 2);
assert.strictEqual(w.location.hash, '#3');
w.location.hash = '#nope'; w.dispatchEvent(new w.Event('hashchange'));
assert.strictEqual(w.location.hash, '#3', 'unknown hash reset');
assert.strictEqual(events, 2);
// end / start bounds
deck.goTo(999); assert.strictEqual(deck.time, deck.length); assert.strictEqual(deck.next(), false);
assert.ok(w.document.getElementById('arrowDown').classList.contains('inactive'));
deck.goTo(-5); assert.strictEqual(deck.time, 0); assert.strictEqual(deck.prev(), false);
// overview
deck.toggleOverview(); assert.ok(w.document.body.classList.contains('navigate'));
deck.toggleOverview(); assert.ok(!w.document.body.classList.contains('navigate'));
deck.destroy();

// --- default rules on the newton example (.steps, .pause)
{
  const html3 = fs.readFileSync(__dirname + '/../examples/newton/newton.html', 'utf8').replace(/<script[^>]*src="[^"]*"><\/script>/g, '');
  const d3 = new JSDOM(html3, { runScripts: 'outside-only', url: 'http://localhost/newton.html' });
  d3.window.eval(fs.readFileSync(__dirname + '/../transition.js', 'utf8'));
  const deck3 = d3.window.TransitionJS.init({ keyboard: false, touch: false });
  const steps = d3.window.document.querySelectorAll('.steps > *, .pause');
  assert.strictEqual(steps.length, 5);
  steps.forEach(el => assert.strictEqual(el.getAttribute('data-fragments'), '{shown} 0.4s'));
  assert.strictEqual(deck3.length, 16);
  deck3.goTo(6); assert.ok(Array.from(steps).slice(0,3).every(el => el.classList.contains('shown')));
  deck3.goTo(3); assert.ok(!steps[0].classList.contains('shown'));
  deck3.destroy();
}

// --- parser corner cases
const d2 = new JSDOM(`<div id="slides">
  <section></section>
  <section data-fragments="{a} +0[x]{b} 1s 0.5s #7{c}2s +1{--v++ d} -3{e} {f}"></section>
  <div id="x"></div><section data-fragments="garbage {g}"></section></div>`, { runScripts: 'outside-only' });
d2.window.eval(fs.readFileSync(__dirname + '/../transition.js', 'utf8'));
const warn2 = []; d2.window.console.warn = (...a) => warn2.push(a.join(' '));
const slides2 = d2.window.TransitionJS.slidesOf(d2.window.document.getElementById('slides'));
const p = d2.window.TransitionJS.parseFragments(d2.window.document, slides2);
const byTok = Object.fromEntries(p.fragments.map(f => [f.toggle.join('')||f.inc.join(''), f]));
assert.strictEqual(byTok.a.time, 1);
assert.strictEqual(byTok.b.time, 1); assert.strictEqual(byTok.b.targets[0].id, 'x');
assert.strictEqual(byTok.b.duration, 1); assert.strictEqual(byTok.b.delay, 0.5);
assert.strictEqual(byTok.c.time, 7); assert.strictEqual(byTok.c.duration, 2);
assert.strictEqual(byTok.d.time, 8); assert.deepStrictEqual(Array.from(byTok.d.inc), ['--v']);
assert.strictEqual(byTok.e.time, 4);
assert.strictEqual(byTok.f.time, 8);
assert.strictEqual(p.length, 8);
assert.ok(!byTok.g, 'garbage stops parsing');
assert.ok(warn2.some(s => s.includes('cannot parse')));
console.log('warnings:', warnings, warn2);
console.log('ALL TESTS PASSED');
