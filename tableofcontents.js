/*!
 * tableofcontents.js — v2.0 (companion of transition.js)
 *
 * Builds tables of contents from the slides:
 *   - part titles are slides that are <h2> elements (direct children of #slides);
 *   - optionally, headings found inside slides (e.g. <h3>) become sub-entries.
 *
 * Every entry is a link to its slide (an id is generated on the slide when
 * missing) and carries a custom property `--i`: the index (1-based) of the part
 * it belongs to. A container that increments its own `--current` at each part
 * title — with a rule such as
 *     { selector: '#slides > h2:not(:first-child)',
 *       fragments: '[slides]{--shift++} 0.4s +0[toc]{--current++} 0.4s' }
 * — can then style visited / current / upcoming entries in pure CSS by
 * comparing `--i` with `--current` (see themes/beamer.css).
 *
 * Usage — call it BEFORE TransitionJS.init(), so that generated ids are known
 * to the deck (hash navigation):
 *
 *     TransitionJS.tableOfContents({
 *       slides: '#slides',        // container
 *       target: '.toc',           // element(s) receiving the <ul>
 *       parts:  'h2',             // slides that are part titles
 *       sub:    'h3',             // headings inside slides (null: none)
 *       links:  true,
 *     });
 */
(function (global) {
  'use strict';

  function slugify(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'slide';
  }

  function ensureId(el, text) {
    if (el.id) return el.id;
    const base = slugify(text);
    let id = base, k = 2;
    while (document.getElementById(id)) id = base + '-' + k++;
    el.id = id;
    return id;
  }

  function tableOfContents(opts = {}) {
    const TJ = global.TransitionJS || {};
    const container = typeof opts.slides === 'string' || !opts.slides
      ? document.querySelector(opts.slides || '#slides') : opts.slides;
    if (!container) { console.warn('[TransitionJS] tableOfContents: no slides container'); return []; }
    const slides = TJ.slidesOf ? TJ.slidesOf(container) : Array.from(container.children);
    const parts = opts.parts || 'h2';
    const sub = opts.sub === undefined ? 'h3' : opts.sub;
    const links = opts.links !== false;

    // Collect entries in slide order.
    const entries = [];
    let part = 0;
    slides.forEach((slide) => {
      if (slide.matches(parts)) {
        part++;
        entries.push({ level: 1, part, text: slide.textContent.trim(), id: ensureId(slide, slide.textContent) });
      } else if (sub) {
        slide.querySelectorAll(sub).forEach((h) => {
          entries.push({ level: 2, part, text: h.textContent.trim(), id: ensureId(slide, h.textContent) });
        });
      }
    });

    // Render into every target.
    const targets = typeof opts.target === 'string' || !opts.target
      ? document.querySelectorAll(opts.target || '.toc') : [].concat(opts.target);
    targets.forEach((toc) => {
      const ul = document.createElement('ul');
      entries.forEach((e) => {
        const li = document.createElement('li');
        li.className = 'toc-level-' + e.level;
        li.style.setProperty('--i', String(e.part));
        if (links) {
          const a = document.createElement('a');
          a.href = '#' + e.id;
          a.textContent = e.text;
          li.appendChild(a);
        } else {
          li.textContent = e.text;
        }
        ul.appendChild(li);
      });
      toc.appendChild(ul);
    });
    return entries;
  }

  (global.TransitionJS = global.TransitionJS || {}).tableOfContents = tableOfContents;
})(typeof window !== 'undefined' ? window : this);
