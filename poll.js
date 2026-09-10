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
 */
(function (global) {
  'use strict';

  function polls(opts) {
    opts = opts || {};
    const server = String(opts.server || '').replace(/\/$/, '');
    const session = opts.session || 'default';
    const key = opts.key !== undefined ? opts.key : new URLSearchParams(location.search).get('key') || '';
    if (!server) { console.warn('[TransitionJS] polls: no server given'); return null; }
    const api = server + '/api/' + encodeURIComponent(session) + '/';
    const voteUrl = server + '/s/' + encodeURIComponent(session);

    const elements = Array.from(document.querySelectorAll('.poll[data-poll]'));
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

    const params = new URLSearchParams(location.search);
    const ready = (key && params.get('reset')) ? post('reset', {}) : Promise.resolve();

    // Presenter: react to the `open` class
    const wasOpen = new WeakMap();
    function check(el) {
      const open = el.classList.contains('open');
      if (open === !!wasOpen.get(el)) return;
      wasOpen.set(el, open);
      if (!key && !opts.key) return; // display-only deck
      ready.then(() => open ? post('open', describe(el)) : post('close', { poll: el.dataset.poll }));
    }
    const observer = new MutationObserver((records) => records.forEach((r) => check(r.target)));
    elements.forEach((el) => { wasOpen.set(el, el.classList.contains('open')); observer.observe(el, { attributes: true, attributeFilter: ['class'] }); });
    elements.forEach(check);

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
