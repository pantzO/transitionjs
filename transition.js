/*!
 * transition.js — v2.0
 * A minimal engine for HTML/CSS slide decks.
 *
 * Principle
 * ---------
 * A presentation is a sequence of steps. Each step applies a set of
 * "fragments": class toggles and CSS custom-property increments on DOM
 * elements. Everything visual (moving from one slide to the next, revealing
 * a bullet, colouring a formula, fading a section) is left to CSS.
 *
 * Fragment syntax
 * ---------------
 * Fragments live in a `data-fragments` attribute. Several fragments can be
 * given, separated by whitespace:
 *
 *     [time] [targets] {tokens} [duration] [delay]
 *
 *   time      (none)   next step: the cursor advances by one
 *             +n       cursor + n, the cursor does not move ("+0" = same step as before)
 *             -n       cursor - n, the cursor does not move
 *             #n       absolute step n; the cursor is set to n
 *   targets   [id1,id2,this,slide]  comma separated ids, `this` (the element
 *             itself) or `slide` (the enclosing slide). Default: this.
 *   tokens    name      toggle the class `name`
 *             --var++   increment the custom property `--var`
 *             --var--   decrement it
 *   duration  e.g. 0.5s  transition duration (0s if omitted)
 *   delay     e.g. 0.2s  transition delay, applied when moving forward only
 *
 * Example:
 *     data-fragments="{hidden} +0[slides]{--shift++} 1s  #7{big} 0.3s"
 *
 * The cursor is global to the document: fragments are read in document order,
 * so the natural order of the HTML is the natural order of the presentation.
 * Going backwards reverses the fragments of the current step.
 *
 * Slides
 * ------
 * A slide is any direct child of the slides container (`#slides` by default):
 * a <section>, but also an <h2> used as a part title. Children carrying a
 * `data-tj-ignore` attribute are not slides.
 *
 * Public API
 * ----------
 *   const deck = TransitionJS.init({
 *     slides:    '#slides',      // container (selector or element)
 *     arrowUp:   '#arrowUp',     // optional
 *     arrowDown: '#arrowDown',   // optional
 *     hash:      true,           // mirror the current slide in the URL
 *     keyboard:  true,
 *     touch:     true,
 *     defaultRules: true,        // slide changes, `.steps > *` and `.pause` (see below)
 *     rules: [                   // your own fragments applied by selector
 *       { selector: '#slides > h2:not(:first-child)', fragments: '[slides]{--shift++} 0.5s +0[toc]{--current++} 0.5s' },
 *     ],
 *   });
 *
 * With defaultRules (on by default) three rules are installed before yours:
 *   - every slide but the first brings itself on screen
 *     ('[slides]{--shift++} 0.6s', or '{active} 0.6s' when #slides has class "fade");
 *   - each child of an element with class "steps" is revealed in turn ('{shown} 0.4s');
 *   - each element with class "pause" is revealed in turn ('{shown} 0.4s').
 * transition.css hides `.steps > *` and `.pause` until they carry `shown`.
 *
 *   deck.next(); deck.prev(); deck.goTo(step); deck.goToSlide(index);
 *   deck.time; deck.length; deck.slideIndex; deck.slide; deck.slides;
 *   deck.toggleOverview(); deck.destroy();
 *
 * Rules
 * -----
 * A rule sets `data-fragments` on every element matching its selector, before
 * parsing. An element that already carries `data-fragments` in the HTML is
 * left alone (inline wins). When several rules match one element, only the
 * most specific one applies (CSS specificity; ties: last rule wins). Rules do
 * not concatenate.
 *
 * Events (on document)
 * --------------------
 *   'transitionjs:change'  detail: { time, slide, previousSlide, direction }
 *
 * Classes maintained on slides: tj-current, tj-past, tj-future.
 * Targets of fragments get a `data-tj-target` attribute; transition.css uses
 * it to bind `transition` to the `--tj-duration` / `--tj-delay` variables.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  const $ = (x, root) => (typeof x === 'string' ? (root || document).querySelector(x) : x || null);
  const warn = (...args) => console.warn('[TransitionJS]', ...args);
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
  const currentHash = () => {
    try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return location.hash.slice(1); }
  };

  /** Direct children of the container that count as slides. */
  function slidesOf(container) {
    return Array.from(container.children).filter((el) => !el.hasAttribute('data-tj-ignore'));
  }

  /** Read a numeric custom property (with optional unit) from computed style. */
  function readVar(el, prop) {
    const raw = getComputedStyle(el).getPropertyValue(prop).trim();
    const m = raw.match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
    return m ? { n: parseFloat(m[1]), unit: m[2] } : { n: 0, unit: '' };
  }

  /** Add `delta` to a numeric custom property, preserving its unit. */
  function addToVar(el, prop, delta) {
    const v = readVar(el, prop);
    const n = Math.round((v.n + delta) * 1e6) / 1e6;
    el.style.setProperty(prop, n + v.unit);
  }

  /* ------------------------------------------------------------------ */
  /* CSS specificity (good enough for rule priority)                     */
  /* ------------------------------------------------------------------ */

  /** Returns [ids, classes, types] for a selector list (max over the list). */
  function specificity(selector) {
    let s = selector.replace(/(["']).*?\1/g, '""'); // neutralise strings
    let a = 0, b = 0, c = 0;

    // :where(...) counts for nothing: strip it with its (possibly nested) argument.
    let w;
    while ((w = s.indexOf(':where(')) >= 0) {
      let depth = 0, end = w + 6;
      for (; end < s.length; end++) {
        if (s[end] === '(') depth++;
        else if (s[end] === ')' && --depth === 0) break;
      }
      s = s.slice(0, w) + s.slice(end + 1);
    }
    // :not(), :is(), :has() → specificity of their most specific argument.
    // Processed innermost-first by repeated substitution.
    const fn = /:(not|is|has)\(([^()]*)\)/;
    let m;
    while ((m = fn.exec(s))) {
      const inner = specificity(m[2]);
      a += inner[0]; b += inner[1]; c += inner[2];
      s = s.slice(0, m.index) + s.slice(m.index + m[0].length);
    }
    // Only the most specific alternative of a selector list counts.
    if (s.includes(',')) {
      return s.split(',').map(specificity).reduce((best, cur) => (cmp(cur, best) > 0 ? cur : best));
    }
    a += (s.match(/#[\w-]+/g) || []).length;
    b += (s.match(/\.[\w-]+/g) || []).length;
    b += (s.match(/\[[^\]]*\]/g) || []).length;
    b += (s.match(/(^|[^:]):[\w-]+/g) || []).length;          // pseudo-classes
    c += (s.match(/::[\w-]+/g) || []).length;                  // pseudo-elements
    c += (s.replace(/\[[^\]]*\]/g, '').match(/(^|[\s>+~(])([a-zA-Z][\w-]*)/g) || []).length; // types
    return [a, b, c];
  }
  function cmp(x, y) {
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  }

  /* ------------------------------------------------------------------ */
  /* Rules                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Set `data-fragments` from a list of { selector, fragments } rules.
   * Inline attributes win; among rules, the most specific selector wins
   * (ties: last rule wins). Returns the modified elements.
   */
  function applyRules(rules, root) {
    root = root || document;
    if (!Array.isArray(rules)) return [];
    const best = new Map(); // element -> { fragments, spec, index }
    rules.forEach((rule, index) => {
      if (!rule || !rule.selector) return;
      const fragments = String(rule.fragments || rule.fg || '').trim();
      if (!fragments) return;
      let nodes;
      try { nodes = root.querySelectorAll(rule.selector); }
      catch (e) { warn('invalid selector in rule:', rule.selector); return; }
      const spec = specificity(rule.selector);
      nodes.forEach((el) => {
        if (el.hasAttribute('data-fragments')) return;
        const cur = best.get(el);
        if (!cur || cmp(spec, cur.spec) >= 0) best.set(el, { fragments, spec, index });
      });
    });
    const modified = [];
    best.forEach((v, el) => { el.setAttribute('data-fragments', v.fragments); modified.push(el); });
    return modified;
  }

  /* ------------------------------------------------------------------ */
  /* Parsing                                                             */
  /* ------------------------------------------------------------------ */

  // [time] [targets] {tokens} [duration] [delay]
  const FRAGMENT = /(?:(#|\+|-)(\d+))?\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}(?:\s*(\d*\.?\d+)s)?(?:\s*(\d*\.?\d+)s)?/y;
  const SPACES = /\s*/y;

  /**
   * Parse every `data-fragments` in document order.
   * Returns { fragments (sorted by time), length }.
   */
  function parseFragments(root, slides) {
    const fragments = [];
    let cursor = 0;

    root.querySelectorAll('[data-fragments]').forEach((owner) => {
      const src = owner.getAttribute('data-fragments');
      let pos = 0;
      while (true) {
        SPACES.lastIndex = pos; SPACES.exec(src); pos = SPACES.lastIndex;
        if (pos >= src.length) break;
        FRAGMENT.lastIndex = pos;
        const m = FRAGMENT.exec(src);
        if (!m) { warn('cannot parse fragments near "' + src.slice(pos, pos + 20) + '"', owner); break; }
        pos = FRAGMENT.lastIndex;
        const [, op, nStr, targetsStr, body, durStr, delayStr] = m;
        const n = nStr == null ? 0 : parseInt(nStr, 10);

        let time;
        if (op === '#') { time = n; cursor = n; }
        else if (op === '+') time = cursor + n;
        else if (op === '-') time = cursor - n;
        else time = ++cursor;
        if (time < 1) { warn('fragment at step ' + time + ' will never be applied', owner); continue; }

        const targets = [];
        (targetsStr || '').split(',').map((t) => t.trim()).filter(Boolean).forEach((key) => {
          if (key === 'this') targets.push(owner);
          else if (key === 'slide') {
            const s = slides.find((sl) => sl === owner || sl.contains(owner));
            if (s) targets.push(s); else warn('"slide" target used outside a slide', owner);
          } else {
            const el = document.getElementById(key);
            if (el) targets.push(el); else warn('unknown target id "' + key + '"', owner);
          }
        });
        if (!targets.length) targets.push(owner);

        const toggle = [], inc = [], dec = [];
        body.trim().split(/\s+/).filter(Boolean).forEach((tok) => {
          if (/^--[\w-]+\+\+$/.test(tok)) inc.push(tok.slice(0, -2));
          else if (/^--[\w-]+--$/.test(tok)) dec.push(tok.slice(0, -2));
          else toggle.push(tok);
        });

        fragments.push({
          owner, time, targets, toggle, inc, dec,
          duration: durStr ? parseFloat(durStr) : 0,
          delay: delayStr ? parseFloat(delayStr) : 0,
          order: fragments.length,
        });
      }
    });

    fragments.sort((x, y) => x.time - y.time || x.order - y.order);
    const length = fragments.length ? fragments[fragments.length - 1].time : 0;
    return { fragments, length };
  }

  /* ------------------------------------------------------------------ */
  /* Deck                                                                */
  /* ------------------------------------------------------------------ */

  const FORWARD = new Set(['Enter', ' ', 'ArrowDown', 'ArrowRight', 'PageDown']);
  const BACKWARD = new Set(['ArrowUp', 'ArrowLeft', 'PageUp']);

  class Deck {
    constructor(opts = {}) {
      this.root = $(opts.root) || document;
      this.container = $(opts.slides || '#slides', this.root);
      if (!this.container) throw new Error('[TransitionJS] slides container not found');
      this.arrowUp = $(opts.arrowUp || '#arrowUp', this.root);
      this.arrowDown = $(opts.arrowDown || '#arrowDown', this.root);
      this.useHash = opts.hash !== false;
      this.reducedMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

      const rules = [];
      if (opts.defaultRules !== false) rules.push(...this._defaultRules());
      if (opts.rules) rules.push(...opts.rules);
      if (rules.length) applyRules(rules, this.root);

      this.slides = slidesOf(this.container);
      const parsed = parseFragments(this.root, this.slides);
      this.fragments = parsed.fragments;
      this.length = parsed.length;
      this.time = 0;
      this._computeStarts();

      // Mark targets so transition.css can bind `transition` to --tj-duration/--tj-delay.
      this.fragments.forEach((f) => f.targets.forEach((t) => t.setAttribute('data-tj-target', '')));

      // Listeners
      this._onKey = this._onKey.bind(this);
      this._onHash = this._onHash.bind(this);
      this._onClick = this._onClick.bind(this);
      this._onPointerDown = this._onPointerDown.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
      this._next = () => this.next();
      this._prev = () => this.prev();

      if (opts.keyboard !== false) document.addEventListener('keydown', this._onKey);
      if (this.useHash) global.addEventListener('hashchange', this._onHash);
      if (opts.touch !== false) {
        this.container.addEventListener('pointerdown', this._onPointerDown);
        this.container.addEventListener('pointerup', this._onPointerUp);
      }
      this.container.addEventListener('click', this._onClick);
      if (this.arrowDown) this.arrowDown.addEventListener('click', this._next);
      if (this.arrowUp) this.arrowUp.addEventListener('click', this._prev);

      const initialHash = currentHash();
      this._refresh();               // also writes #1 in the URL…
      if (this.useHash) this._goToHash(initialHash); // …so the incoming hash is read first
    }

    _defaultRules() {
      const id = this.container.id;
      if (!id) { warn('the slides container has no id: no default rule brings slides on screen'); return []; }
      const fade = this.container.classList.contains('fade');
      return [
        { selector: '#' + id + ' > :not(:first-child)', fragments: fade ? '{active} 0.6s' : '[' + id + ']{--shift++} 0.6s' },
        { selector: '.steps > *', fragments: '{shown} 0.4s' },
        { selector: '.pause', fragments: '{shown} 0.4s' },
      ];
    }

    /* ---- state ---- */

    /** Index of the slide displayed at the current step. */
    get slideIndex() { return this._slideAt(this.time); }
    /** The slide element displayed at the current step. */
    get slide() { return this.slides[this.slideIndex]; }

    _computeStarts() {
      const n = this.slides.length;
      const start = new Array(n).fill(undefined);
      for (const f of this.fragments) {
        const i = this.slides.findIndex((s) => s === f.owner || s.contains(f.owner));
        if (i >= 0 && (start[i] === undefined || f.time < start[i])) start[i] = f.time;
      }
      // The first slide is visible from step 0 whatever it contains.
      this._own = start.map((t, i) => i === 0 || t !== undefined);
      start[0] = 0;
      for (let i = 1; i < n; i++) {
        if (start[i] === undefined) {
          warn('slide ' + (i + 1) + ' has no fragment: nothing brings it on screen', this.slides[i]);
          start[i] = start[i - 1];
        }
      }
      this._start = start;
    }

    _slideAt(time) {
      let best = 0;
      for (let i = 1; i < this.slides.length; i++) {
        if (this._own[i] && this._start[i] <= time) best = i;
      }
      return best;
    }

    /* ---- navigation ---- */

    /** Go one step forward. Returns false when already at the end. */
    next(o = {}) {
      if (this.time >= this.length) return false;
      const from = this.slideIndex;
      this.time++;
      this._applyStep(this.time, +1, o.animate !== false && !this.reducedMotion);
      if (!o.silent) this._afterMove(from, +1);
      return true;
    }

    /** Go one step backward. Returns false when already at the start. */
    prev(o = {}) {
      if (this.time <= 0) return false;
      const from = this.slideIndex;
      this._applyStep(this.time, -1, o.animate !== false && !this.reducedMotion);
      this.time--;
      if (!o.silent) this._afterMove(from, -1);
      return true;
    }

    /** Jump to an absolute step, without animation. */
    goTo(step) {
      step = Math.max(0, Math.min(this.length, step | 0));
      if (step === this.time) return;
      const from = this.slideIndex;
      const dir = step > this.time ? +1 : -1;
      while (this.time < step) this.next({ animate: false, silent: true });
      while (this.time > step) this.prev({ animate: false, silent: true });
      this._afterMove(from, dir);
    }

    /** Jump to the first step of slide `index` (0-based). */
    goToSlide(index) {
      index = Math.max(0, Math.min(this.slides.length - 1, index | 0));
      while (index > 0 && !this._own[index]) index--; // unreachable slide → previous one
      this.goTo(this._start[index]);
    }

    _applyStep(step, dir, animate) {
      for (const f of this.fragments) {
        if (f.time !== step) continue;
        const duration = animate ? f.duration : 0;
        const delay = animate && dir > 0 ? f.delay : 0;
        for (const t of f.targets) {
          t.style.setProperty('--tj-duration', duration + 's');
          t.style.setProperty('--tj-delay', delay + 's');
          f.toggle.forEach((c) => t.classList.toggle(c));
          f.inc.forEach((p) => addToVar(t, p, dir));
          f.dec.forEach((p) => addToVar(t, p, -dir));
        }
      }
    }

    _afterMove(previousSlide, direction) {
      this._refresh();
      emit('transitionjs:change', {
        time: this.time, slide: this.slideIndex, previousSlide, direction, deck: this,
      });
    }

    _refresh() {
      const cur = this.slideIndex;
      this.slides.forEach((s, i) => {
        s.classList.toggle('tj-current', i === cur);
        s.classList.toggle('tj-past', i < cur);
        s.classList.toggle('tj-future', i > cur);
      });
      if (this.arrowUp) this.arrowUp.classList.toggle('inactive', this.time <= 0);
      if (this.arrowDown) this.arrowDown.classList.toggle('inactive', this.time >= this.length);
      this._syncHash();
    }

    /* ---- URL hash ---- */

    _hashOf(index) {
      const s = this.slides[index];
      return s.id || String(index + 1);
    }

    _syncHash() {
      if (!this.useHash) return;
      const h = this._hashOf(this.slideIndex);
      if (currentHash() !== h) history.replaceState(null, '', '#' + h);
    }

    /** Resolve a hash (slide id, or 1-based index) and jump there. */
    _goToHash(h) {
      if (!h) return false;
      let i = this.slides.findIndex((s) => s.id === h);
      if (i < 0 && /^\d+$/.test(h)) i = parseInt(h, 10) - 1;
      if (i < 0 || i >= this.slides.length) return false;
      this.goToSlide(i);
      return true;
    }

    _onHash() {
      // replaceState() never fires hashchange: this only runs on user-driven changes
      // (typed URL, <a href="#id">, back button). An unknown hash is reset.
      if (!this._goToHash(currentHash())) this._syncHash();
    }

    /* ---- overview ---- */

    get overview() { return document.body.classList.contains('navigate'); }

    /** Toggle the zoomed-out overview (body.navigate). */
    toggleOverview(force) {
      const on = document.body.classList.toggle('navigate', force);
      this.container.style.setProperty('--tj-duration', '0s'); // no animated relayout
      if (on) {
        const s = this.slide;
        if (s && s.scrollIntoView) s.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      } else {
        global.scrollTo(0, 0);
      }
      return on;
    }

    /* ---- input ---- */

    _onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const k = e.key;
      if (this.overview) {
        if (k === 'Escape' || k === 'Enter') { e.preventDefault(); this.toggleOverview(false); }
        return; // arrows scroll the overview
      }
      if (FORWARD.has(k)) { e.preventDefault(); this.next(); }
      else if (BACKWARD.has(k)) { e.preventDefault(); this.prev(); }
      else if (k === 'Home') { e.preventDefault(); this.goTo(0); }
      else if (k === 'End') { e.preventDefault(); this.goTo(this.length); }
      else if (k === 'Escape') { e.preventDefault(); this.toggleOverview(true); }
    }

    _onClick(e) {
      if (!this.overview) return;
      const slide = this.slides.find((s) => s.contains(e.target));
      if (!slide) return;
      e.preventDefault();
      this.toggleOverview(false);
      this.goToSlide(this.slides.indexOf(slide));
    }

    _onPointerDown(e) {
      if (e.pointerType !== 'touch') return;
      this._touch = { x: e.clientX, y: e.clientY };
    }
    _onPointerUp(e) {
      if (!this._touch || this.overview) return;
      const dx = e.clientX - this._touch.x, dy = e.clientY - this._touch.y;
      this._touch = null;
      const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (Math.abs(d) < 40) return;
      if (d < 0) this.next(); else this.prev();
    }

    /* ---- teardown ---- */

    destroy() {
      document.removeEventListener('keydown', this._onKey);
      global.removeEventListener('hashchange', this._onHash);
      this.container.removeEventListener('pointerdown', this._onPointerDown);
      this.container.removeEventListener('pointerup', this._onPointerUp);
      this.container.removeEventListener('click', this._onClick);
      if (this.arrowDown) this.arrowDown.removeEventListener('click', this._next);
      if (this.arrowUp) this.arrowUp.removeEventListener('click', this._prev);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Public surface                                                      */
  /* ------------------------------------------------------------------ */

  const TransitionJS = global.TransitionJS || {};
  TransitionJS.version = '2.0';
  TransitionJS.init = (opts) => (TransitionJS.deck = new Deck(opts));
  TransitionJS.Deck = Deck;
  TransitionJS.applyRules = applyRules;
  TransitionJS.parseFragments = parseFragments;
  TransitionJS.slidesOf = slidesOf;
  TransitionJS.specificity = specificity;
  global.TransitionJS = TransitionJS;
})(typeof window !== 'undefined' ? window : this);
