// ============================================================================
// GUESS THE MODEL — "The Lineup"
// Vanilla SPA. Architecture: a tiny DOM builder (el) with mount-once,
// patch-in-place updates. The game <iframe> is created ONCE per play session
// and reused — rating a game or switching tabs never rebuilds it, so the game
// never reloads out from under you.
// ============================================================================

(() => {
  'use strict';

  const DATA = window.GTM_DATA || { challenges: [], models: [] };
  const APP = document.getElementById('app');
  const TOAST = document.getElementById('toast');
  const LETTERS = 'ABCDEFGHIJKL'.split('');

  // --------------------------------------------------------------------------
  // DOM builder
  //   el('div.card#id', {onClick, style:{}, dataset:{}, text|html, ...attrs}, ...kids)
  // --------------------------------------------------------------------------

  function el(sel, props, ...kids) {
    if (props != null && (typeof props !== 'object' || props.nodeType || Array.isArray(props))) {
      kids = [props, ...kids];
      props = {};
    }
    props = props || {};
    const tag = (sel.match(/^([a-z0-9]+)/i) || [, 'div'])[1];
    const node = document.createElement(tag);
    const id = sel.match(/#([\w-]+)/);
    if (id) node.id = id[1];
    const cls = (sel.match(/\.([\w-]+)/g) || []).map(s => s.slice(1));
    if (cls.length) node.className = cls.join(' ');

    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    appendKids(node, kids);
    return node;
  }

  function appendKids(node, kids) {
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
  }

  function mount(...nodes) {
    APP.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
    window.scrollTo(0, 0);
  }

  // --------------------------------------------------------------------------
  // Small utilities
  // --------------------------------------------------------------------------

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function byId(cid) {
    return DATA.challenges.find(c => c.id === cid) || null;
  }
  function entryById(challenge, eid) {
    return challenge.entries.find(e => e.id === eid) || null;
  }

  let toastTimer = null;
  function toast(msg) {
    TOAST.textContent = msg;
    TOAST.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => TOAST.classList.remove('show'), 2600);
  }

  function go(hash) { location.hash = hash; }

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
  // Persistence  (single namespaced object)
  // --------------------------------------------------------------------------

  const KEY = 'gtm_v3';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

  function saveProgress(session) {
    const s = load();
    s.progress = s.progress || {};
    s.progress[session.challenge.id] = {
      order: session.order, active: session.active,
      ratings: session.ratings, guesses: session.guesses, phase: session.phase,
    };
    save(s);
  }
  function loadProgress(cid) { const s = load(); return (s.progress && s.progress[cid]) || null; }
  function clearProgress(cid) { const s = load(); if (s.progress) delete s.progress[cid]; save(s); }

  function saveResult(session) {
    const s = load();
    s.results = s.results || {};
    s.results[session.challenge.id] = {
      when: nowSafe(), score: session.result.score, total: session.result.total,
      order: session.order, ratings: session.ratings, guesses: session.guesses,
    };
    s.stats = s.stats || { plays: 0, correct: 0 };
    s.stats.plays += 1;
    s.stats.correct += session.result.score;
    s.best = s.best || {};
    const prev = s.best[session.challenge.id];
    if (!prev || session.result.score > prev.score)
      s.best[session.challenge.id] = { score: session.result.score, total: session.result.total };
    save(s);
  }
  function loadResult(cid) { const s = load(); return (s.results && s.results[cid]) || null; }
  function getBest(cid) { const s = load(); return (s.best && s.best[cid]) || null; }
  function getStats() { const s = load(); return s.stats || { plays: 0, correct: 0 }; }
  function nowSafe() { try { return Date.now(); } catch { return 0; } }

  // --------------------------------------------------------------------------
  // Session model
  // --------------------------------------------------------------------------

  function newSession(challenge) {
    return {
      challenge,
      order: shuffle(challenge.entries.map(e => e.id)), // index -> letter
      active: 0,
      ratings: {},   // entryId -> 0..5
      guesses: {},   // letter  -> model name
      phase: 'brief',
      result: null,
    };
  }
  function reviveSession(challenge, saved) {
    return {
      challenge,
      order: saved.order.filter(id => entryById(challenge, id)),
      active: Math.min(saved.active || 0, saved.order.length - 1),
      ratings: saved.ratings || {},
      guesses: saved.guesses || {},
      phase: saved.phase || 'brief',
      result: null,
    };
  }

  // Distinct models actually competing in a given challenge (the visible lineup).
  function challengeModels(challenge) {
    return Array.from(new Set(challenge.entries.map(e => e.model)));
  }
  function modelChips(models) {
    return el('div.model-chips', models.map(m => el('span.model-chip', m)));
  }

  function computeReveal(challenge, order, guesses, ratings) {
    let score = 0;
    const rows = order.map((eid, i) => {
      const letter = LETTERS[i];
      const entry = entryById(challenge, eid);
      const guess = guesses[letter] || '';
      const correct = guess === entry.model;
      if (correct) score++;
      return { letter, actual: entry.model, guess, correct, rating: ratings[eid] || 0, file: entry.file };
    });
    return { score, total: order.length, rows };
  }

  // ==========================================================================
  // Chrome
  // ==========================================================================

  function topbar() {
    return el('header.topbar',
      el('div.wrap.topbar-inner',
        el('a.brand', { href: '#/' },
          el('span.brand-seal', el('span.brand-q', '?')),
          el('span.brand-text',
            el('b', 'Guess the Model'),
            el('small', 'a blind AI lineup'))),
        el('span.topbar-spacer'),
        el('a.topbar-link', { href: '#/', text: 'The arena' })));
  }

  function footer() {
    return el('footer.footer-wrap',
      el('div.wrap.footer',
        el('span', 'Guess the Model — same prompt, different models, sealed until you call it.'),
        el('span.footer-note', 'Everything stays in your browser. Nothing is uploaded.')));
  }

  // ==========================================================================
  // HOME
  // ==========================================================================

  function Home() {
    setAccent(null);
    const stats = getStats();
    const challenges = DATA.challenges;
    const totalEntries = challenges.reduce((n, c) => n + c.entries.length, 0);
    const denom = stats.guessTotal || 0;
    const rate = denom ? Math.round((stats.correct / denom) * 100) : null;

    const hero = el('section.hero',
      el('span.eyebrow', el('span.pulse'), 'CASE FILES OPEN'),
      el('h1.hero-title',
        'Same prompt.',
        el('br'),
        el('span.hero-accent', 'Different models.'),
        el('br'),
        'Sealed until you call it.'),
      el('p.hero-lead',
        'Every model in the lineup got the exact same brief and built a game blind, ',
        'in a single HTML file. Play each one, rate it, then match the build to the model. ',
        'No logos, no tells — just the code, until you commit.'),
      el('div.hero-stats',
        stat(challenges.length, 'Open cases'),
        stat(totalEntries, 'Sealed builds'),
        stat(stats.correct, 'Calls you nailed'),
        stat(rate == null ? '—' : rate + '%', 'Hit rate')));

    const head = el('div.section-head',
      el('h2', 'The lineup'),
      el('span.section-hint', 'Pick a case. Builds are re-shuffled every round.'));

    const grid = el('div.case-grid',
      challenges.length
        ? challenges.map(caseCard)
        : el('div.empty', el('div.empty-big', 'No cases yet.'), 'Add a challenge in js/data.js.'));

    return mount(topbar(), el('main.wrap', hero, head, grid), footer());
  }

  function stat(n, label) {
    return el('div.stat', el('div.stat-n', String(n)), el('div.stat-l', label));
  }

  function caseCard(c) {
    const best = getBest(c.id);
    const result = loadResult(c.id);
    const progress = loadProgress(c.id);
    const n = c.entries.length;

    const statusChip = best
      ? el('span.case-best', 'Best ', el('b', `${best.score}/${best.total}`))
      : progress
        ? el('span.case-status.resume', 'In progress')
        : el('span.case-status', 'New case');

    const pips = el('div.case-pips',
      Array.from({ length: n }, () => el('span.pip')));

    const actions = el('div.case-actions',
      el('button.btn.btn-accent', { onClick: () => go('/c/' + c.id) },
        progress ? 'Resume →' : 'Open case →'),
      result && el('button.btn.btn-quiet', { onClick: () => go('/c/' + c.id + '/result') },
        'Last verdict'));

    return el('article.case-card', { style: { '--case': c.accent || 'var(--accent)' } },
      el('div.case-top',
        el('span.case-badge', 'CASE'),
        statusChip),
      el('h3.case-title', c.title),
      el('p.case-tag', c.tagline || ''),
      el('div.case-prompt', el('span.case-prompt-mark', '$'), c.prompt),
      el('div.case-models',
        el('span.case-models-label', 'In the lineup'),
        modelChips(challengeModels(c))),
      el('div.case-foot', pips, el('span.case-count', `${n} sealed`)),
      actions);
  }

  // ==========================================================================
  // SESSION  (brief / play / guess / reveal live in-app, no hash churn)
  // ==========================================================================

  function Session(challenge) {
    setAccent(challenge);
    const saved = loadProgress(challenge.id);
    const session = (saved && saved.phase !== 'reveal' && Array.isArray(saved.order) && saved.order.length)
      ? reviveSession(challenge, saved)
      : newSession(challenge);

    const steps = subbarSteps((key) => {
      // let the header steps jump between Play and Call it as a shortcut
      if (session.phase !== 'play' && session.phase !== 'guess') return;
      if (key === 'play' && session.phase !== 'play') ctrl.goPhase('play');
      else if (key === 'guess' && session.phase !== 'guess') ctrl.goPhase('guess');
    });
    const phaseSlot = el('main.session.wrap');
    const subbar = el('div.subbar',
      el('div.wrap.subbar-inner',
        el('a.subbar-back', { href: '#/' }, '←', el('span', 'All cases')),
        el('div.subbar-title',
          el('span.st', challenge.title),
          el('span.ss', `${challenge.entries.length} sealed builds · shuffled blind`)),
        steps.node));

    mount(topbar(), subbar, phaseSlot, footer());

    const ctrl = {
      session,
      goPhase(phase, opts) {
        session.phase = phase;
        if (!opts || opts.persist !== false) saveProgress(session);
        steps.set(phase);
        phaseSlot.replaceChildren(this.build(phase));
      },
      build(phase) {
        if (phase === 'play') return Play(ctrl);
        if (phase === 'guess') return Guess(ctrl);
        if (phase === 'reveal') return Reveal(ctrl);
        return Brief(ctrl);
      },
      finish() {
        const c = session.challenge;
        const r = computeReveal(c, session.order, session.guesses, session.ratings);
        session.result = { score: r.score, total: r.total, rows: r.rows };
        saveResultWithDenominator(session);
        clearProgress(c.id);
        session.phase = 'reveal';
        steps.set('reveal');
        phaseSlot.replaceChildren(this.build('reveal'));
      },
      restart() {
        clearProgress(session.challenge.id);
        const fresh = newSession(session.challenge);
        Object.assign(session, fresh);
        this.goPhase('play');
      },
    };

    ctrl.goPhase(session.phase, { persist: false });
  }

  function saveResultWithDenominator(session) {
    // saveResult + track guessTotal so the home hit-rate has an honest denominator.
    saveResult(session);
    const s = load();
    s.stats = s.stats || { plays: 0, correct: 0 };
    s.stats.guessTotal = (s.stats.guessTotal || 0) + session.result.total;
    save(s);
  }

  function subbarSteps(onStep) {
    const items = [
      { key: 'play', n: '1', label: 'Play' },
      { key: 'guess', n: '2', label: 'Call it' },
      { key: 'reveal', n: '3', label: 'Reveal' },
    ];
    const nodes = {};
    const wrap = el('div.subbar-steps',
      items.map((it, i) => {
        const clickable = onStep && it.key !== 'reveal';
        const step = el('span.step' + (clickable ? '.step-nav' : ''),
          { onClick: clickable ? () => onStep(it.key) : undefined },
          el('i', it.n), it.label);
        nodes[it.key] = step;
        return [step, i < items.length - 1 ? el('span.step-sep', '/') : null];
      }));
    return {
      node: wrap,
      set(phase) {
        const active = phase === 'brief' ? 'play' : phase;
        Object.entries(nodes).forEach(([k, n]) => n.classList.toggle('active', k === active));
      },
    };
  }

  // --------------------------------------------------------------------------
  // BRIEF
  // --------------------------------------------------------------------------

  function Brief(ctrl) {
    const c = ctrl.session.challenge;
    const n = c.entries.length;
    const result = loadResult(c.id);

    const steps = [
      ['01', 'Play blind', `${n} builds, tagged A–${LETTERS[n - 1]} in random order. Give each one a real spin.`],
      ['02', 'Rate as you go', 'Star each build 1–5. We surface which model you secretly rated highest.'],
      ['03', 'Call it', 'Match every model to a tag. Then the seals break and you see how sharp your eye is.'],
    ];

    return el('section.brief',
      el('span.eyebrow', el('span.pulse'), 'CASE BRIEFING'),
      el('h1.brief-title', c.title),
      el('p.brief-lead', c.tagline || ''),
      el('div.dossier',
        el('div.dossier-label', 'THE BRIEF — identical for every model'),
        el('div.dossier-text', '“', c.prompt, '”'),
        c.promptMeta && el('div.dossier-meta', c.promptMeta)),
      el('div.brief-steps',
        steps.map(([num, h, d]) =>
          el('div.brief-step',
            el('span.brief-step-n', num),
            el('div.brief-step-h', h),
            el('div.brief-step-d', d)))),
      el('div.brief-models',
        el('div.brief-models-label', `The lineup · ${challengeModels(c).length} models`),
        modelChips(challengeModels(c))),
      el('div.brief-actions',
        el('button.btn.btn-accent.btn-lg', { onClick: () => ctrl.goPhase('play') }, 'Enter the lineup →'),
        result && el('button.btn.btn-quiet.btn-lg', { onClick: () => go('/c/' + c.id + '/result') },
          `Last verdict · ${result.score}/${result.total}`)),
      el('p.brief-note', 'You know who is in the room — not which build is theirs. Identities stay sealed until you call it.'));
  }

  // --------------------------------------------------------------------------
  // PLAY  — the iframe is built ONCE; rating/tab-state patch nodes in place.
  // --------------------------------------------------------------------------

  function Play(ctrl) {
    const s = ctrl.session;
    const c = s.challenge;

    // Persistent iframe — never recreated while in Play.
    const frame = el('iframe.stage-frame', {
      title: 'Sealed build',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gamepad; pointer-lock; web-share',
      allowfullscreen: true,
    });

    const overlayChip = el('span.stage-chip');
    const stageWrap = el('div.stage', { id: 'stageWrap' },
      frame,
      el('div.stage-overlay',
        overlayChip,
        el('div.stage-tools',
          el('button.icon-btn', { title: 'Fullscreen', onClick: toggleFullscreen }, iconFullscreen()),
          el('button.icon-btn', { title: 'Open in new tab', onClick: () => window.open(frame.src, '_blank', 'noopener') }, iconExternal()))));

    // Tabs (filmstrip)
    const tabEls = s.order.map((eid, i) =>
      el('button.spec-tab', { onClick: () => setActive(i) },
        el('span.spec-letter', LETTERS[i]),
        el('span.spec-name', 'Entry ' + LETTERS[i]),
        el('span.spec-tab-star')));
    const tabs = el('div.spec-strip', tabEls);

    // Rating bar
    const starEls = [1, 2, 3, 4, 5].map(n =>
      el('button.rate-star', { 'aria-label': `${n} of 5`, onClick: () => setRating(n) }, '★'));
    starEls.forEach((star, idx) => {
      const n = idx + 1;
      star.addEventListener('mouseenter', () => paintStars(n, true));
      star.addEventListener('mouseleave', () => paintStars(activeRating(), false));
    });
    const rateLabel = el('span.rate-label');
    const rateRow = el('div.rate-row',
      el('span.rate-lbl', 'Your read on this build'),
      el('div.stars', starEls),
      rateLabel);

    const progress = el('span.play-progress');
    const prevBtn = el('button.btn.btn-quiet', { onClick: () => setActive(s.active - 1) }, '← Prev');
    const nextBtn = el('button.btn.btn-accent', { onClick: onNext });

    const root = el('div.play',
      tabs,
      stageWrap,
      el('div.play-foot',
        rateRow,
        el('div.play-nav', progress, prevBtn, nextBtn)));

    // ---- in-place patch helpers (no rebuild) ----
    function activeEid() { return s.order[s.active]; }
    function activeRating() { return s.ratings[activeEid()] || 0; }

    function paintStars(n, hover) {
      starEls.forEach((st, i) => {
        st.classList.toggle('on', i < n);
        st.classList.toggle('hover', hover && i < n);
      });
    }
    function renderRating() {
      const r = activeRating();
      paintStars(r, false);
      rateLabel.textContent = r ? `${r}/5` : 'tap to rate';
      rateLabel.classList.toggle('set', !!r);
    }
    function renderTabs() {
      tabEls.forEach((t, i) => {
        t.classList.toggle('active', i === s.active);
        const r = s.ratings[s.order[i]] || 0;
        const star = t.querySelector('.spec-tab-star');
        star.textContent = r ? '★'.repeat(1) : '';
        star.classList.toggle('rated', !!r);
        t.classList.toggle('seen', i === s.active || !!r);
      });
    }
    function renderProgress() {
      const rated = s.order.filter(id => s.ratings[id]).length;
      progress.textContent = `${rated}/${s.order.length} rated`;
    }
    function isLast() { return s.active >= s.order.length - 1; }
    function renderNav() {
      prevBtn.disabled = s.active === 0;
      nextBtn.textContent = isLast() ? 'Call it →' : `Next · Entry ${LETTERS[s.active + 1]} →`;
    }
    function onNext() {
      if (isLast()) ctrl.goPhase('guess');
      else setActive(s.active + 1);
    }

    // ---- actions ----
    function setActive(i) {
      if (i === s.active && frame.src) { return; }
      s.active = i;
      const entry = entryById(c, s.order[i]);
      frame.src = entry.file;                 // ONLY place the iframe reloads
      overlayChip.replaceChildren(el('b', LETTERS[i]), ` Entry ${LETTERS[i]} · identity sealed`);
      renderTabs(); renderRating(); renderNav();
      saveProgress(s);
    }
    function setRating(n) {
      const eid = activeEid();
      s.ratings[eid] = (s.ratings[eid] === n) ? 0 : n;   // toggle off if same
      renderRating(); renderTabs(); renderProgress();     // patch only — no iframe touch
      saveProgress(s);
    }

    // initial paint (sets src once)
    setActive(s.active);
    renderProgress();
    return root;
  }

  function toggleFullscreen() {
    const wrap = document.getElementById('stageWrap');
    if (!wrap) return;
    if (!document.fullscreenElement) (wrap.requestFullscreen || wrap.webkitRequestFullscreen)?.call(wrap);
    else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  }

  // --------------------------------------------------------------------------
  // GUESS  — full roster (with decoys); in-place option/disabled updates.
  // --------------------------------------------------------------------------

  function Guess(ctrl) {
    const s = ctrl.session;
    const c = s.challenge;
    // Only the models that actually competed — the task is to order them correctly.
    const models = challengeModels(c);

    const selects = [];
    const rows = s.order.map((eid, i) => {
      const letter = LETTERS[i];
      const rating = s.ratings[eid] || 0;
      const sel = el('select.model-select', { dataset: { letter }, onChange: onChange },
        el('option', { value: '' }, '— name the model —'),
        models.map(m => el('option', { value: m }, m)));
      sel.value = s.guesses[letter] || '';
      selects.push(sel);
      return el('div.call-row', { dataset: { letter } },
        el('div.call-letter', letter),
        el('div.call-meta',
          el('div.call-name', 'Entry ' + letter),
          el('div.call-sub', rating ? `you rated it ${rating}/5` : 'unrated')),
        el('div.select-wrap', sel));
    });

    const progress = el('span.call-progress');
    const revealBtn = el('button.btn.btn-accent', { onClick: reveal }, 'Break the seals ↑');

    const root = el('section.call',
      el('h2.call-h', 'Who built what?'),
      el('p.call-lead', 'For each sealed build, name the model you think made it. Each model can be used once. Trust your gut — calls are final once revealed.'),
      el('div.call-list', rows),
      el('div.call-foot',
        progress,
        el('div.call-buttons',
          el('button.btn.btn-quiet', { onClick: () => ctrl.goPhase('play') }, '← Back to play'),
          revealBtn)));

    function onChange(e) {
      const sel = e.currentTarget;
      const letter = sel.dataset.letter;
      if (sel.value) s.guesses[letter] = sel.value;
      else delete s.guesses[letter];
      refresh();
      saveProgress(s);
    }

    function refresh() {
      selects.forEach(sel => {
        const letter = sel.dataset.letter;
        Array.from(sel.options).forEach(opt => {
          if (!opt.value) return;
          const taken = Object.entries(s.guesses).some(([l, v]) => v === opt.value && l !== letter);
          opt.disabled = taken;
          opt.textContent = opt.value + (taken ? '  (used)' : '');
        });
        sel.value = s.guesses[letter] || '';
        const row = sel.closest('.call-row');
        if (row) row.classList.toggle('filled', !!s.guesses[letter]);
      });
      const filled = s.order.filter((_, i) => s.guesses[LETTERS[i]]).length;
      progress.replaceChildren(el('b', String(filled)), ` / ${s.order.length} named`);
      revealBtn.disabled = filled !== s.order.length;
    }

    function reveal() {
      const filled = s.order.filter((_, i) => s.guesses[LETTERS[i]]).length;
      if (filled !== s.order.length) { toast('Name every build before revealing.'); return; }
      ctrl.finish();
    }

    refresh();
    return root;
  }

  // --------------------------------------------------------------------------
  // REVEAL  (live) and RESULT view (from storage) share revealScreen()
  // --------------------------------------------------------------------------

  function Reveal(ctrl) {
    const s = ctrl.session;
    const r = s.result || computeReveal(s.challenge, s.order, s.guesses, s.ratings);
    return revealScreen(s.challenge, r, {
      actions: [
        el('button.btn.btn-accent.btn-lg', { onClick: () => ctrl.restart() }, '↻ New round (re-shuffled)'),
        el('a.btn.btn-quiet.btn-lg', { href: '#/' }, 'All cases →'),
      ],
    });
  }

  function ResultView(challenge) {
    setAccent(challenge);
    const saved = loadResult(challenge.id);
    if (!saved) { go('/c/' + challenge.id); return; }
    const r = computeReveal(challenge, saved.order, saved.guesses, saved.ratings);

    const subbar = el('div.subbar',
      el('div.wrap.subbar-inner',
        el('a.subbar-back', { href: '#/' }, '←', el('span', 'All cases')),
        el('div.subbar-title',
          el('span.st', challenge.title),
          el('span.ss', 'saved verdict')),
        el('div.subbar-steps', el('span.step.active', el('i', '✓'), 'Verdict'))));

    const screen = revealScreen(challenge, r, {
      replay: true,
      actions: [
        el('button.btn.btn-accent.btn-lg', { onClick: () => { clearProgress(challenge.id); go('/c/' + challenge.id); } }, '↻ Play again'),
        el('a.btn.btn-quiet.btn-lg', { href: '#/' }, 'All cases →'),
      ],
    });

    mount(topbar(), subbar, el('main.session.wrap', screen), footer());
  }

  function revealScreen(challenge, r, opts) {
    opts = opts || {};
    const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
    const verdict =
      r.score === r.total ? 'Flawless read. You know these models cold.' :
      pct >= 60 ? 'Sharp — well above chance.' :
      pct >= 40 ? 'A real coin-toss. Slippery bunch.' :
        'They had you fooled this round.';

    const hero = el('div.verdict-hero',
      el('div.verdict-label', 'You called'),
      el('div.verdict-score', String(r.score), el('small', '/' + r.total)),
      el('div.verdict-line', verdict),
      (() => { const b = getBest(challenge.id); return b ? el('div.verdict-best', `personal best · ${b.score}/${b.total}`) : null; })());

    // favourite (by rating)
    const rated = r.rows.filter(x => x.rating > 0);
    let fav = null;
    if (rated.length) {
      const max = Math.max(...rated.map(x => x.rating));
      const tops = rated.filter(x => x.rating === max);
      const allSame = rated.length === r.rows.length && new Set(rated.map(x => x.rating)).size === 1;
      fav = el('div.fav-card', el('span.fav-ico', '★'),
        el('span.fav-txt', allSame
          ? `You rated every build ${max}/5 — even-handed judge.`
          : tops.length === 1
            ? ['Your top-rated build was ', el('b', tops[0].actual), '.']
            : ['Your top-rated builds: ', el('b', tops.map(t => t.actual).join(', ')), '.']));
    }

    const rows = el('div.reveal-list',
      r.rows.map((x, i) =>
        el('div.reveal-row ' + (x.correct ? 'correct' : 'wrong'), { style: { '--i': i } },
          el('div.reveal-letter', x.letter),
          el('div.reveal-info',
            el('div.reveal-model', x.actual),
            el('div.reveal-your',
              'your call: ',
              el('span', { class: x.correct ? 'ok' : 'no' }, x.guess || '—')),
            el('a.reveal-open', { href: x.file, target: '_blank', rel: 'noopener' }, `Open Entry ${x.letter} ↗`)),
          el('div.reveal-rating', x.rating ? `★ ${x.rating}/5` : el('span.none', 'unrated')),
          el('div.stamp ' + (x.correct ? 'ok' : 'no'), x.correct ? 'CALLED' : 'MISSED'))));

    return el('section.reveal',
      hero,
      fav,
      rows,
      el('div.reveal-actions', opts.actions || []));
  }

  // --------------------------------------------------------------------------
  // Icons
  // --------------------------------------------------------------------------

  function iconFullscreen() {
    return el('span.ic', { html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>` });
  }
  function iconExternal() {
    return el('span.ic', { html: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>` });
  }

  // --------------------------------------------------------------------------
  // Router
  // --------------------------------------------------------------------------

  function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    const parts = h.split('/').filter(Boolean);
    if (parts.length === 0) return Home();
    if (parts[0] === 'c' && parts[1]) {
      const c = byId(parts[1]);
      if (!c) return go('/');
      if (parts[2] === 'result') return ResultView(c);
      return Session(c);
    }
    return Home();
  }

  window.addEventListener('hashchange', route);
  route();
})();
