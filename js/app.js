// ============================================================================
// GUESS THE MODEL — app logic (vanilla SPA, hash-routed)
// ============================================================================

(() => {
  'use strict';

  const DATA = window.GTM_DATA || { challenges: [] };
  const APP  = document.getElementById('app');
  const TOAST = document.getElementById('toast');

  const STORE_KEY = 'gtm_state_v1';

  // --------------------------------------------------------------------------
  // Utilities
  // --------------------------------------------------------------------------

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const LETTERS = 'ABCDEFGHIJ'.split('');

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let toastTimer = null;
  function toast(msg) {
    TOAST.textContent = msg;
    TOAST.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => TOAST.classList.remove('show'), 2400);
  }

  function byId(id) {
    return DATA.challenges.find(c => c.id === id) || null;
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveStore(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
  }

  function getBest(challengeId) {
    const s = loadStore();
    return (s.best && s.best[challengeId]) || null; // {score, total}
  }
  function recordResult(challengeId, score, total) {
    const s = loadStore();
    if (!s.best) s.best = {};
    const prev = s.best[challengeId];
    if (!prev || score > prev.score || (score === prev.score && total > prev.total)) {
      s.best[challengeId] = { score, total, when: Date.now() };
    }
    if (!s.plays) s.plays = [];
    s.plays.push({ id: challengeId, score, total, when: Date.now() });
    s.plays = s.plays.slice(-50);
    saveStore(s);
  }

  // Full snapshot of the most recent revealed round, so a result can be
  // re-opened later (even after a reload) instead of vanishing.
  function saveLastResult(challengeId) {
    if (!SESSION || !SESSION.result) return;
    const s = loadStore();
    if (!s.last) s.last = {};
    s.last[challengeId] = {
      when: Date.now(),
      score: SESSION.result.score,
      total: SESSION.result.total,
      slots: SESSION.slots.map(sl => ({
        letter: sl.letter,
        id: sl.entry.id,
        model: sl.entry.model,
        file: sl.entry.file,
        rating: sl.rating,
        guess: SESSION.guesses[sl.letter] || '',
      })),
    };
    saveStore(s);
  }
  function getLast(challengeId) {
    const s = loadStore();
    return (s.last && s.last[challengeId]) || null;
  }

  function totalPlays() {
    const s = loadStore();
    return (s.plays || []).length;
  }
  function totalCorrect() {
    const s = loadStore();
    return (s.plays || []).reduce((n, p) => n + (p.score || 0), 0);
  }

  // --------------------------------------------------------------------------
  // Routing
  // --------------------------------------------------------------------------

  function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    const parts = h.split('/').filter(Boolean); // e.g. ['c','ultrakill-clone']

    setAccent(null); // reset to default each render; view can override

    if (parts.length === 0)              return renderHome();
    if (parts[0] === 'c' && parts[1])    return renderSession(parts[1], parts[2] || 'brief');
    renderHome();
  }

  function go(hash) {
    location.hash = hash;
  }

  window.addEventListener('hashchange', () => { route(); window.scrollTo(0,0); });

  // --------------------------------------------------------------------------
  // Accent theming
  // --------------------------------------------------------------------------

  function setAccent(challenge) {
    const root = document.documentElement;
    if (challenge && challenge.accent) {
      root.style.setProperty('--accent', challenge.accent);
      root.style.setProperty('--accent-2', challenge.accent2 || challenge.accent);
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-2');
    }
  }

  // --------------------------------------------------------------------------
  // Top bar
  // --------------------------------------------------------------------------

  function topbar() {
    return `
      <header class="topbar">
        <div class="wrap topbar-inner">
          <a class="brand" href="#/" data-link>
            <span class="brand-mark">?</span>
            <span>Guess&nbsp;the&nbsp;Model <small>blind AI arena</small></span>
          </a>
          <div class="topbar-spacer"></div>
        </div>
      </header>`;
  }

  function footer() {
    return `
      <div class="wrap">
        <div class="footer">
          <span>Guess the Model — a blind comparison arena for AI-built games.</span>
          <span>Answers live in your browser. No data leaves this page.</span>
        </div>
      </div>`;
  }

  // --------------------------------------------------------------------------
  // HOME
  // --------------------------------------------------------------------------

  function renderHome() {
    const plays = totalPlays();
    const correct = totalCorrect();
    const challenges = DATA.challenges;
    const totalEntries = challenges.reduce((n, c) => n + c.entries.length, 0);

    const cards = challenges.map(cardHTML).join('');

    APP.innerHTML = `
      ${topbar()}
      <main class="wrap">
        <section class="home-hero">
          <span class="eyebrow"><span class="dot"></span> BLIND&nbsp;AI&nbsp;ARENA</span>
          <h1>Play the games.<br><span class="grad">Guess the model.</span></h1>
          <p class="lead">
            Several AI models were given the exact same prompt and told to build a game
            in a single HTML file. Play each entry blind, then match it to the model you
            think made it. Find out which model actually writes the best code — by feel.
          </p>

          <div class="home-stats">
            <div class="home-stat"><div class="n">${challenges.length}</div><div class="l">Challenges</div></div>
            <div class="home-stat"><div class="n">${totalEntries}</div><div class="l">Anonymous entries</div></div>
            <div class="home-stat"><div class="n">${correct}</div><div class="l">Correct guesses (you)</div></div>
            <div class="home-stat"><div class="n">${plays}</div><div class="l">Rounds played</div></div>
          </div>
        </section>

        <div class="section-head">
          <h2>Open challenges</h2>
          <span class="hint">Pick one to play blind. Entries are shuffled every round.</span>
        </div>

        <div class="challenge-grid">
          ${cards || emptyHTML('No challenges yet.')}
        </div>
      </main>
      ${footer()}
    `;
    bindCards();
  }

  function emptyHTML(msg) {
    return `<div class="empty" style="grid-column:1/-1"><div class="big">${escapeHtml(msg)}</div></div>`;
  }

  function cardHTML(c) {
    const best = getBest(c.id);
    const n = c.entries.length;
    // pips
    const pips = Array.from({ length: Math.max(n, 2) }, (_, i) =>
      `<span class="pip ${i < n ? 'filled' : ''}"></span>`).join('');

    const status = best
      ? `<span class="cc-score">Best <span class="best">${best.score}/${best.total}</span></span>`
      : `<span class="cc-status">New</span>`;

    return `
      <button class="challenge-card" data-cid="${escapeHtml(c.id)}"
        style="--card-accent:${escapeHtml(c.accent || '#ff3030')}">
        <div class="cc-top">
          <span class="cc-badge">Challenge</span>
          ${status}
        </div>
        <div class="cc-title">${escapeHtml(c.title)}</div>
        <div class="cc-tag">${escapeHtml(c.tagline || '')}</div>
        <div class="cc-prompt">${escapeHtml(c.prompt)}</div>
        <div class="cc-foot">
          <span class="cc-entries">${pips} ${n} entr${n === 1 ? 'y' : 'ies'}</span>
          <span class="btn btn-ghost" style="padding:8px 14px;font-size:13px">Play →</span>
        </div>
      </button>`;
  }

  function bindCards() {
    $$('.challenge-card').forEach(card => {
      card.addEventListener('click', () => go('/c/' + card.dataset.cid));
    });
  }

  // --------------------------------------------------------------------------
  // SESSION STATE
  // --------------------------------------------------------------------------
  // We hold the live session in a module-level variable so it survives re-renders
  // triggered by hash changes within the same challenge.

  let SESSION = null;

  function startSession(challenge) {
    // Shuffle entries into "slots": each slot has a display letter + the entry
    const shuffled = shuffle(challenge.entries);
    const slots = shuffled.map((entry, i) => ({
      letter: LETTERS[i],
      entry,                 // { id, model, file }
      rating: 0,             // 0..5 (0 = unrated)
    }));
    SESSION = {
      challenge,
      phase: 'brief',        // brief | play | guess | reveal
      slots,
      active: 0,             // index into slots
      guesses: {},           // letter -> modelName
      result: null,          // {score, total, perLetter}
    };
  }

  // Rebuild a completed session from its saved snapshot so its reveal can be
  // re-opened. Returns true if a snapshot existed and was restored.
  function restoreResultSession(challenge) {
    const last = getLast(challenge.id);
    if (!last || !Array.isArray(last.slots) || !last.slots.length) return false;

    const slots = last.slots.map(sl => ({
      letter: sl.letter,
      entry: { id: sl.id, model: sl.model, file: sl.file },
      rating: sl.rating || 0,
    }));
    const guesses = {};
    const perLetter = {};
    last.slots.forEach(sl => {
      guesses[sl.letter] = sl.guess;
      perLetter[sl.letter] = {
        guess: sl.guess,
        actual: sl.model,
        correct: sl.guess === sl.model,
        rating: sl.rating || 0,
        entryId: sl.id,
        file: sl.file,
      };
    });

    SESSION = {
      challenge,
      phase: 'reveal',
      slots,
      active: 0,
      guesses,
      result: { score: last.score, total: last.total, perLetter },
    };
    return true;
  }

  function renderSession(cid, phaseArg) {
    const challenge = byId(cid);
    if (!challenge) { go('/'); return; }
    setAccent(challenge);

    if (!SESSION || SESSION.challenge.id !== cid) {
      // Deep-linking / returning to a revealed round: rebuild it from the
      // saved snapshot instead of restarting from scratch.
      if (phaseArg === 'reveal' && restoreResultSession(challenge)) {
        // SESSION now holds the restored reveal.
      } else {
        startSession(challenge);
      }
    } else if (phaseArg === 'reveal' && !SESSION.result) {
      // Live session for this challenge but nothing revealed yet (e.g. clicked
      // "View last result" from the briefing) — restore the saved snapshot.
      restoreResultSession(challenge);
    }
    if (phaseArg && ['brief','play','guess','reveal'].includes(phaseArg) && phaseArg !== SESSION.phase) {
      // Allow hash to drive phase transitions (e.g. back button).
      // Guard: never auto-skip into 'reveal' without a result.
      if (!(phaseArg === 'reveal' && !SESSION.result)) {
        SESSION.phase = phaseArg;
      }
    }

    const shell = (inner) => `
      ${topbar()}
      <div class="session-bar">
        <div class="wrap session-bar-inner">
          <a class="session-back" href="#/" data-link>← All challenges</a>
          <div class="session-title">
            <span class="t">${escapeHtml(challenge.title)}</span>
            <span class="s">${challenge.entries.length} anonymous entries · shuffled blind</span>
          </div>
          <div class="session-phase">
            ${phaseChip('1','Play', SESSION.phase === 'play' || SESSION.phase === 'brief')}
            <span class="sep">→</span>
            ${phaseChip('2','Guess', SESSION.phase === 'guess')}
            <span class="sep">→</span>
            ${phaseChip('3','Reveal', SESSION.phase === 'reveal')}
          </div>
        </div>
      </div>
      <main class="session wrap">${inner}</main>
    `;

    if (SESSION.phase === 'brief')  return APP.innerHTML = shell(renderBrief());
    if (SESSION.phase === 'play')   return APP.innerHTML = shell(renderPlay());
    if (SESSION.phase === 'guess')  return APP.innerHTML = shell(renderGuess());
    if (SESSION.phase === 'reveal') return APP.innerHTML = shell(renderReveal());
  }

  function phaseChip(n, label, active) {
    return `<span class="step ${active ? 'active' : ''}">${n}. ${label}</span>`;
  }

  // --------------------------------------------------------------------------
  // BRIEFING
  // --------------------------------------------------------------------------

  function renderBrief() {
    const c = SESSION.challenge;
    const n = c.entries.length;
    const last = getLast(c.id);
    const html = `
      <section class="briefing">
        <span class="eyebrow"><span class="dot"></span> CHALLENGE</span>
        <h1>${escapeHtml(c.title)}</h1>
        <p class="lead">${escapeHtml(c.tagline || '')}</p>

        <div class="prompt-block">
          <div class="label">The exact prompt every model received</div>
          <div class="text">"${escapeHtml(c.prompt)}"</div>
          ${c.promptMeta ? `<div class="meta">${escapeHtml(c.promptMeta)}</div>` : ''}
        </div>

        <div class="howto">
          <div class="howto-step">
            <div class="num">STEP 1 — PLAY</div>
            <div class="h">Try every entry</div>
            <div class="d">${n} anonymous builds, labeled A–${LETTERS[n-1]}. Give each a fair spin. The order is randomized.</div>
          </div>
          <div class="howto-step">
            <div class="num">STEP 2 — RATE (optional)</div>
            <div class="h">Star your favourites</div>
            <div class="d">Rate each entry 1–5 while you play. We'll show which model you secretly liked best.</div>
          </div>
          <div class="howto-step">
            <div class="num">STEP 3 — GUESS</div>
            <div class="h">Match model → entry</div>
            <div class="d">Assign each model to a letter. Then the veil lifts and you see how you did.</div>
          </div>
        </div>

        <div class="briefing-actions">
          <button class="btn btn-primary btn-lg" id="start-play">Enter the arena →</button>
          ${last ? `<button class="btn btn-ghost btn-lg" id="view-last">View last result · ${last.score}/${last.total} →</button>` : ''}
          <div class="contestants">Models in the running: <b>${n}</b> · identities hidden until reveal</div>
        </div>
      </section>`;
    requestAnimationFrame(() => {
      const b = $('#start-play');
      if (b) b.addEventListener('click', () => { SESSION.phase = 'play'; go('/c/' + SESSION.challenge.id + '/play'); });
      const v = $('#view-last');
      if (v) v.addEventListener('click', () => { go('/c/' + SESSION.challenge.id + '/reveal'); });
    });
    return html;
  }

  // --------------------------------------------------------------------------
  // PLAY
  // --------------------------------------------------------------------------

  function renderPlay() {
    const c = SESSION.challenge;
    const slot = SESSION.slots[SESSION.active];
    const allRated = SESSION.slots.every(s => s.rating > 0);
    const anyRated = SESSION.slots.some(s => s.rating > 0);

    const tabs = SESSION.slots.map((s, i) => `
      <button class="entry-tab ${i === SESSION.active ? 'active' : ''}" data-slot="${i}">
        <span class="letter">${s.letter}</span>
        Entry ${s.letter}
        <span class="star-toggle ${s.rating > 0 ? 'on' : ''}" title="${s.rating ? s.rating + '/5' : 'unrated'}">${
          s.rating > 0 ? '★'.repeat(Math.min(s.rating,1)) : '☆'
        }</span>
      </button>`).join('');

    const html = `
      <div class="play-shell">
        <div class="entry-tabs">${tabs}</div>

        <div class="game-frame-wrap" id="frameWrap">
          <iframe
            id="gameFrame"
            src="${escapeHtml(slot.entry.file)}"
            title="Entry ${slot.letter}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gamepad; pointer-lock; web-share"
            allowfullscreen
          ></iframe>
          <div class="game-overlay">
            <span class="game-chip"><span class="letter">${slot.letter}</span> Entry ${slot.letter} · identity hidden</span>
            <div class="game-toolbar">
              <button class="icon-btn" id="fsBtn" title="Fullscreen" aria-label="Fullscreen">
                ${ICON_FULLSCREEN}
              </button>
              <button class="icon-btn" id="newTabBtn" title="Open in new tab" aria-label="Open in new tab">
                ${ICON_EXTERNAL}
              </button>
            </div>
          </div>
        </div>

        <div class="play-foot">
          <div class="rate-row">
            <span class="lbl">Your rating for Entry ${slot.letter}:</span>
            <div class="stars" data-slot="${SESSION.active}">
              ${[1,2,3,4,5].map(n =>
                `<span class="star ${n <= slot.rating ? 'on' : ''}" data-n="${n}">★</span>`
              ).join('')}
            </div>
            ${slot.rating > 0 ? `<span class="lbl" style="color:var(--warn)">${slot.rating}/5</span>` : `<span class="lbl" style="color:var(--text-faint)">click to rate</span>`}
          </div>
          <div class="foot-nav">
            <span class="foot-hint">${anyRated ? `${countRated()}/${SESSION.slots.length} rated · ` : ''}Click the game to capture input</span>
            <button class="btn btn-primary" id="toGuess">
              ${allRated ? 'Lock in my guesses' : 'Skip to guesses'} →
            </button>
          </div>
        </div>
      </div>`;
    requestAnimationFrame(() => bindPlay());
    return html;
  }

  function countRated() { return SESSION.slots.filter(s => s.rating > 0).length; }

  function bindPlay() {
    // tab switching
    $$('.entry-tab').forEach(t => {
      t.addEventListener('click', () => {
        SESSION.active = +t.dataset.slot;
        renderCurrent();
      });
    });

    // rating
    $$('.stars').forEach(group => {
      const slotIdx = +group.dataset.slot;
      group.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', () => {
          const n = +star.dataset.n;
          const cur = SESSION.slots[slotIdx].rating;
          SESSION.slots[slotIdx].rating = (cur === n) ? 0 : n; // toggle off if same
          renderCurrent();
        });
        star.addEventListener('mouseenter', () => previewStars(group, +star.dataset.n));
        star.addEventListener('mouseleave', () => previewStars(group, SESSION.slots[slotIdx].rating));
      });
    });

    // fullscreen
    $('#fsBtn')?.addEventListener('click', () => {
      const wrap = $('#frameWrap');
      if (!document.fullscreenElement) {
        (wrap.requestFullscreen || wrap.webkitRequestFullscreen)?.call(wrap);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      }
    });

    // new tab
    $('#newTabBtn')?.addEventListener('click', () => {
      const f = $('#gameFrame');
      if (f?.src) window.open(f.src, '_blank', 'noopener');
    });

    // proceed
    $('#toGuess')?.addEventListener('click', () => {
      SESSION.phase = 'guess';
      go('/c/' + SESSION.challenge.id + '/guess');
    });
  }

  function previewStars(group, n) {
    group.querySelectorAll('.star').forEach(s => {
      s.classList.toggle('on', +s.dataset.n <= n);
    });
  }

  // re-render the current phase (keeps SESSION)
  function renderCurrent() {
    if (SESSION.phase === 'play') {
      APP.innerHTML = APPinnerHTML_play();
      requestAnimationFrame(bindPlay);
    } else {
      route();
    }
  }
  // small helper to wrap play in the session shell without going through hash
  function APPinnerHTML_play() {
    const c = SESSION.challenge;
    setAccent(c);
    const shell = (inner) => `
      ${topbar()}
      <div class="session-bar">
        <div class="wrap session-bar-inner">
          <a class="session-back" href="#/" data-link>← All challenges</a>
          <div class="session-title">
            <span class="t">${escapeHtml(c.title)}</span>
            <span class="s">${c.entries.length} anonymous entries · shuffled blind</span>
          </div>
          <div class="session-phase">
            ${phaseChip('1','Play', true)}
            <span class="sep">→</span>
            ${phaseChip('2','Guess', false)}
            <span class="sep">→</span>
            ${phaseChip('3','Reveal', false)}
          </div>
        </div>
      </div>
      <main class="session wrap">${inner}</main>`;
    return shell(renderPlay());
  }

  // --------------------------------------------------------------------------
  // GUESS
  // --------------------------------------------------------------------------

  function renderGuess() {
    const c = SESSION.challenge;
    // The "menu": the full roster of candidate models (with decoys), so the
    // answer can't be deduced by elimination. Any model an entry actually uses
    // is always included even if it's missing from the roster.
    const roster = Array.isArray(DATA.models) ? DATA.models : [];
    const models = Array.from(new Set([...roster, ...c.entries.map(e => e.model)]));
    const slots = SESSION.slots;

    const filled = slots.filter(s => SESSION.guesses[s.letter]).length;
    const allFilled = filled === slots.length;

    const rows = slots.map(s => {
      const guess = SESSION.guesses[s.letter] || '';
      return `
        <div class="guess-row ${guess ? 'filled' : ''}" data-letter="${s.letter}">
          <div class="guess-letter">${s.letter}</div>
          <div class="guess-meta">
            <div class="name">Entry ${s.letter}</div>
            <div class="sub">${s.rating > 0 ? `your rating: ${s.rating}/5` : 'not rated'}</div>
          </div>
          <select class="model-select" data-letter="${s.letter}">
            <option value="" ${!guess ? 'selected' : ''}>— pick a model —</option>
            ${models.map(m => {
              const taken = Object.entries(SESSION.guesses).some(([l, v]) => v === m && l !== s.letter);
              return `<option value="${escapeHtml(m)}" ${guess === m ? 'selected' : ''} ${taken ? 'disabled' : ''}>
                ${escapeHtml(m)}${taken ? ' (used)' : ''}
              </option>`;
            }).join('')}
          </select>
        </div>`;
    }).join('');

    const html = `
      <div class="guess-shell">
        <h2>Who built what?</h2>
        <p class="lead">
          For each anonymous entry, pick the model you think made it.
          Each model can only be used once. Trust your gut — you can't change this after revealing.
        </p>

        <div class="guess-list">${rows}</div>

        <div class="guess-foot">
          <div class="guess-progress"><b>${filled}</b> / ${slots.length} matched</div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" id="backPlay">← Back to play</button>
            <button class="btn btn-primary" id="reveal" ${allFilled ? '' : 'disabled'}>
              Reveal answers ↑
            </button>
          </div>
        </div>
      </div>`;
    requestAnimationFrame(() => bindGuess());
    return html;
  }

  // Reflect the current guesses into the DOM in place — no full re-render, so
  // the native <select> keeps working across every pick (the old full re-render
  // double-bound listeners and broke voting after the first choice).
  function refreshGuessUI() {
    const selects = $$('.model-select');
    selects.forEach(sel => {
      const letter = sel.dataset.letter;
      Array.from(sel.options).forEach(opt => {
        if (opt.value === '') return;
        const taken = Object.entries(SESSION.guesses).some(([l, v]) => v === opt.value && l !== letter);
        opt.disabled = taken;
        opt.textContent = opt.value + (taken ? ' (used)' : '');
      });
      sel.value = SESSION.guesses[letter] || '';
      const row = sel.closest('.guess-row');
      if (row) row.classList.toggle('filled', !!SESSION.guesses[letter]);
    });

    const filled = SESSION.slots.filter(s => SESSION.guesses[s.letter]).length;
    const prog = $('.guess-progress');
    if (prog) prog.innerHTML = `<b>${filled}</b> / ${SESSION.slots.length} matched`;
    const revealBtn = $('#reveal');
    if (revealBtn) revealBtn.disabled = filled !== SESSION.slots.length;
  }

  function bindGuess() {
    $$('.model-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const letter = sel.dataset.letter;
        if (sel.value) SESSION.guesses[letter] = sel.value;
        else delete SESSION.guesses[letter];
        refreshGuessUI();
      });
    });

    $('#backPlay')?.addEventListener('click', () => {
      SESSION.phase = 'play';
      go('/c/' + SESSION.challenge.id + '/play');
    });

    $('#reveal')?.addEventListener('click', () => {
      if (Object.keys(SESSION.guesses).length !== SESSION.slots.length) {
        toast('Match every entry to a model first.');
        return;
      }
      computeResult();
      SESSION.phase = 'reveal';
      go('/c/' + SESSION.challenge.id + '/reveal');
    });
  }

  // --------------------------------------------------------------------------
  // RESULT
  // --------------------------------------------------------------------------

  function computeResult() {
    let score = 0;
    const perLetter = {};
    SESSION.slots.forEach(s => {
      const guess = SESSION.guesses[s.letter];
      const correct = guess === s.entry.model;
      if (correct) score++;
      perLetter[s.letter] = { guess, actual: s.entry.model, correct, rating: s.rating, entryId: s.entry.id, file: s.entry.file };
    });
    const total = SESSION.slots.length;
    SESSION.result = { score, total, perLetter };
    recordResult(SESSION.challenge.id, score, total);
    saveLastResult(SESSION.challenge.id);
  }

  // --------------------------------------------------------------------------
  // REVEAL
  // --------------------------------------------------------------------------

  function renderReveal() {
    const c = SESSION.challenge;
    const r = SESSION.result;
    if (!r) { SESSION.phase = 'play'; return ''; }

    const pct = r.total ? Math.round(r.score / r.total * 100) : 0;
    const verdict =
      r.score === r.total ? 'Flawless. You read these models like a book.' :
      pct >= 60            ? 'Sharp eye — well above chance.' :
      pct >= 40            ? 'Mixed bag. Hard to tell, huh?' :
                             'Tough round. They fooled you.';

    const rows = SESSION.slots.map(s => {
      const p = r.perLetter[s.letter];
      return `
        <div class="reveal-row ${p.correct ? 'correct' : 'wrong'}">
          <div class="guess-letter">${s.letter}</div>
          <div class="reveal-info">
            <div class="model">${escapeHtml(p.actual)}</div>
            <div class="your">
              you guessed <span class="${p.correct ? 'ok' : 'no'}">${escapeHtml(p.guess || '—')}</span>
            </div>
            <a class="reveal-open" href="${escapeHtml(p.file || s.entry.file)}" target="_blank" rel="noopener">Open Entry ${s.letter} ↗</a>
          </div>
          <div class="reveal-rating">${s.rating > 0 ? `★ ${s.rating}/5` : `<span class="none">unrated</span>`}</div>
          <div class="verdict-pill ${p.correct ? 'ok' : 'no'}">${p.correct ? 'CORRECT' : 'WRONG'}</div>
        </div>`;
    }).join('');

    // Favourite model summary (by your ratings)
    const ratedSlots = SESSION.slots.filter(s => s.rating > 0);
    let summary = '';
    if (ratedSlots.length) {
      // pick top-rated entry(ies)
      const max = Math.max(...ratedSlots.map(s => s.rating));
      const tops = ratedSlots.filter(s => s.rating === max);
      const names = tops.map(s => s.entry.model);
      const yourFav = names.length === SESSION.slots.filter(s=>s.rating>0).length && new Set(ratedSlots.map(s=>s.rating)).size === 1
        ? `You rated every entry ${max}/5 — even-handed judge.`
        : names.length === 1
          ? `Your top-rated entry was built by <b>${escapeHtml(names[0])}</b>.`
          : `Your top-rated entries: <b>${names.map(escapeHtml).join(', ')}</b>.`;
      summary = `
        <div class="summary-card">
          <span class="ico">★</span>
          <span class="txt">${yourFav}</span>
        </div>`;
    }

    const best = getBest(c.id);

    const html = `
        <section class="reveal-shell">
          <div class="score-hero">
            <div class="label">You scored</div>
            <div class="score">${r.score}<small>/${r.total}</small></div>
            <div class="verdict">${escapeHtml(verdict)}</div>
            ${best ? `<div class="best-line">personal best: ${best.score}/${best.total}</div>` : ''}
          </div>

          ${summary}

          <div class="reveal-list">${rows}</div>

          <div class="reveal-actions">
            <button class="btn btn-ghost btn-lg" id="playAgain">↻ Play again (re-shuffled)</button>
            <a class="btn btn-primary btn-lg" href="#/" data-link>All challenges →</a>
          </div>
        </section>`;

    requestAnimationFrame(() => {
      $('#playAgain')?.addEventListener('click', () => {
        startSession(c); // fresh shuffle
        go('/c/' + c.id + '/play');
      });
    });
    return html;
  }

  // --------------------------------------------------------------------------
  // Icons
  // --------------------------------------------------------------------------

  const ICON_FULLSCREEN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
  const ICON_EXTERNAL   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------

  // Intercept same-page hash links rendered as <a href="#/...">
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-link]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#/')) {
      e.preventDefault();
      go(href.slice(1));
    }
  });

  route();
})();
