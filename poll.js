/*!
 * poll.js — live polls in a Transition.js deck (companion of transition.js)
 *
 * A question is an ordinary element of a slide:
 *
 *   <div class="poll" data-poll="q1">
 *     <p>La méthode de Newton converge toujours si f est C².</p>
 *     <ul>
 *       <li>Vrai</li>
 *       <li class="correct">Faux</li>
 *       <li>Ça dépend de x₀</li>
 *     </ul>
 *   </div>
 *
 * data-poll         an id, unique in the session (it names the poll on the server)
 * data-multiple     several answers allowed
 * <p>               the question text sent to the phones (or data-question="…")
 * <li>              the options, in order; class "correct" marks the answer(s)
 *
 * Three classes drive it — toggle them with fragments like anything else:
 *   open      the question is sent to the phones and votes are accepted
 *   results   the bars are shown (poll.css)
 *   answer    the correct options are highlighted (poll.css)
 * e.g.  data-fragments="{open} {open results} {answer}"
 *
 * End of the lecture: an element of class "poll-end" closes the session on the phones
 * when it receives the class `open`, and reopens it if it loses it (going back):
 *
 *   <p class="poll-end" data-message="Merci ! À retenir : …" data-fragments="{open}">…</p>
 *
 * The phones show data-message (or the element's text), and each phone computes its own
 * score from the .correct options of every poll of the deck — the server keeps no score.
 *
 * The script never creates nodes. It only writes CSS custom properties:
 *   on the poll:    --total (voters), --voters (same, while open)
 *   on each <li>:   --votes
 * and attributes: data-poll-url on the poll, src on <img class="poll-qr">.
 *
 * Usage (after transition.js, before or after init):
 *   TransitionJS.polls({
 *     server:  'https://poll-….apps.math.cnrs.fr',   // the poll server
 *     session: 'r309-2026-09-15',                    // one per lecture
 *     key:     '…',        // presenter key; default: the `key` query parameter of the deck URL
 *   });
 * Without a key the deck only displays results (a second screen, a student's laptop).
 * Opening the deck with ?key=…&reset=1 forgets the votes of a previous run of the session.
 *
 * The key is read from the URL once, kept in the tab's sessionStorage, and removed
 * from the address bar right away — so that it is not projected with the slides.
 * Type it before plugging the projector; it survives reloads, not closing the tab.
 */
(function (global) {
  'use strict';

  function polls(opts) {
    opts = opts || {};
    const server = String(opts.server || '').replace(/\/$/, '');
    const session = opts.session || 'default';
    const params = new URLSearchParams(location.search);
    let key = opts.key !== undefined ? opts.key : params.get('key') || '';
    const wantReset = !!params.get('reset');
    try {
      if (opts.key === undefined) {
        if (key) sessionStorage.setItem('tj-poll-key', key);
        else key = sessionStorage.getItem('tj-poll-key') || '';
      }
    } catch (e) { /* storage unavailable: the key only lives in this page load */ }
    if (params.has('key') || params.has('reset')) {     // never leave the key in the address bar
      params.delete('key'); params.delete('reset');
      const q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    }
    if (!server) { console.warn('[TransitionJS] polls: no server given'); return null; }
    const api = server + '/api/' + encodeURIComponent(session) + '/';
    const voteUrl = server + '/s/' + encodeURIComponent(session);

    const elements = Array.from(document.querySelectorAll('.poll[data-poll]'));
    const ends = Array.from(document.querySelectorAll('.poll-end'));
    const byId = new Map(elements.map((el) => [el.dataset.poll, el]));

    // QR codes and vote URL, for the theme to display
    document.querySelectorAll('img.poll-qr').forEach((img) => { img.src = api + 'qr.svg'; });
    document.querySelectorAll('[data-poll-url]').forEach((el) => { el.dataset.pollUrl = voteUrl.replace(/^https?:\/\//, ''); });

    function describe(el) {
      const q = el.dataset.question || (el.querySelector('p') || {}).textContent || '';
      const options = Array.from(el.querySelectorAll('li')).map((li) => li.textContent.trim());
      return { poll: el.dataset.poll, question: q.trim(), options, multiple: el.hasAttribute('data-multiple') };
    }

    function post(action, body) {
      return fetch(api + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Poll-Key': key },
        body: JSON.stringify(body),
      }).then((r) => { if (!r.ok) console.warn('[TransitionJS] polls: ' + action + ' → ' + r.status); return r; })
        .catch((e) => console.warn('[TransitionJS] polls: ' + action + ' failed', e));
    }

    // The correct answers of every poll of the deck, sent to the phones at the end
    function answers() {
      const all = {};
      elements.forEach((el) => {
        const ok = Array.from(el.querySelectorAll('li')).map((li, i) => li.classList.contains('correct') ? i : -1).filter((i) => i >= 0);
        if (ok.length) all[el.dataset.poll] = ok;
      });
      return all;
    }

    const ready = (key && wantReset) ? post('reset', {}) : Promise.resolve();

    // Presenter: react to the `open` class
    const wasOpen = new WeakMap();
    function check(el) {
      const open = el.classList.contains('open');
      if (open === !!wasOpen.get(el)) return;
      wasOpen.set(el, open);
      if (!key && !opts.key) return; // display-only deck
      if (el.classList.contains('poll-end')) {
        const message = (el.dataset.message || el.textContent).trim();
        ready.then(() => post('end', open ? { active: true, message, answers: answers() } : { active: false }));
        return;
      }
      ready.then(() => open ? post('open', describe(el)) : post('close', { poll: el.dataset.poll }));
    }
    const observer = new MutationObserver((records) => records.forEach((r) => check(r.target)));
    const watched = elements.concat(ends);
    watched.forEach((el) => { wasOpen.set(el, el.classList.contains('open')); observer.observe(el, { attributes: true, attributeFilter: ['class'] }); });
    watched.forEach(check);

    // Results: write the counts as CSS variables
    function apply(stateObj) {
      for (const [id, p] of Object.entries(stateObj.polls || {})) {
        const el = byId.get(id);
        if (!el) continue;
        el.style.setProperty('--total', p.total);
        el.style.setProperty('--voters', p.total);
        el.querySelectorAll('li').forEach((li, i) => li.style.setProperty('--votes', p.counts[i] || 0));
      }
      document.documentElement.classList.toggle('poll-online', true);
    }
    const es = new EventSource(api + 'events');
    es.addEventListener('state', (e) => apply(JSON.parse(e.data)));
    es.onerror = () => document.documentElement.classList.toggle('poll-online', false);

    return { api, voteUrl, session, close: () => { es.close(); observer.disconnect(); } };
  }

  (global.TransitionJS = global.TransitionJS || {}).polls = polls;
})(typeof window !== 'undefined' ? window : this);
