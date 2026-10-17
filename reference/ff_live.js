(function () {
  'use strict';
  const root = document.getElementById('wr');
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.from(root.querySelectorAll(s));
  const f1 = d3.format('.1f'), f2 = d3.format('.2f'), pct = d3.format('.0%'), pct1 = d3.format('.1%'), comma = d3.format(',');
  const signed = (x, f) => (x > 0.049 ? '+' : x < -0.049 ? '−' : '±') + (f || f1)(Math.abs(x));
  const spct = (x) => (x >= 0.005 ? '+' : x <= -0.005 ? '−' : '±') + Math.round(Math.abs(x) * 100);
  const oddsTxt = (x) => (x > 0.995 && x < 1 ? '>99%' : x < 0.005 && x > 0 ? '<1%' : pct(x));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ok = (id) => dash.data(id).status === 'ok';
  const rows = (id) => (ok(id) ? dash.data(id).data : []);

  /* ================= calcs the page shows ================= */
  dash.calc('allplay', {
    inputs: ['history', 'teams'],
    title: 'All-play record',
    description: 'Each team’s record if it played all 11 others every finished week.',
    fn: (history, teams) => teams.map((t) => {
      let w = 0, l = 0;
      history.filter((h) => h.final && h.rid === t.rid).forEach((h) => {
        history.filter((o) => o.final && o.week === h.week && o.rid !== t.rid).forEach((o) => { if (h.pts > o.pts) w++; else l++; });
      });
      return { team: t.team, allplay: w + '–' + l, allplay_pct: w / Math.max(1, w + l) };
    }),
  });

  /* ================= data model ================= */
  let D = null, sig = '', chosenRid = null;
  const isMe = (t) => !!D && t.rid === D.me.rid;
  function build() {
    const need = ['teams', 'players', 'schedule', 'history', 'model'];
    if (!need.every(ok)) return null;
    const m = {}; rows('model').forEach((r) => { m[r.metric] = r.value; });
    const P = {}; rows('players').forEach((p) => { P[p.pid] = p; });
    const T = rows('teams').slice();
    const me = (chosenRid != null && T.find((x) => x.rid === chosenRid)) || T.find((x) => x.is_me);
    const cur = Number(m.current_week), last = Number(m.last_regular_week);
    const posRatio = {};
    ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'].forEach((pos) => {
      const p = rows('players').find((x) => x.pos === pos && (x['mu_w' + (cur + 1)] || 0) > 2);
      posRatio[pos] = p ? [p['lo_w' + (cur + 1)] / p['mu_w' + (cur + 1)], p['hi_w' + (cur + 1)] / p['mu_w' + (cur + 1)]] : [0.5, 1.5];
    });
    const maxWeek = Number(m.max_week || 17);
    const weeks = []; for (let w = cur; w <= maxWeek; w++) weeks.push(w);
    const games = rows('schedule').filter((g) => g.week >= cur && g.week <= last);
    const slots = m.slots ? JSON.parse(m.slots) : ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF'];
    const po = m.playoff_weeks ? JSON.parse(m.playoff_weeks) : [15, 16, 17];
    const nP = Math.min(Number(m.playoff_teams || 8), T.length), nDiv = Number(m.divisions || 0);
    return { m, P, T, me, cur, last, sd: Number(m.team_weekly_sd), posRatio, weeks, games, byRid: Object.fromEntries(T.map((t) => [t.rid, t])),
      slots, po: po.length ? po : [last + 1], nP, nDiv, nWild: Math.max(0, nP - nDiv), budget: Number(m.waiver_budget || 0), maxWeek, leagueId: m.league_id, leagueName: m.league_name };
  }

  /* ================= scenario state ================= */
  const S = { ov: {}, adds: new Set(), drops: new Set(), pins: new Set(), benches: new Set(), vol: 1, runs: 20000 };
  const picks = {};                      // playoff machine: game id -> winning rid
  const scenActive = () => Object.keys(S.ov).length || S.adds.size || S.drops.size || S.pins.size || S.benches.size || S.vol !== 1;

  const hasGame = (p, w) => p['opp_w' + w] && p['opp_w' + w] !== 'BYE';
  function irEstimate(p) {
    const v = D.weeks.filter((w) => w > D.cur).map((w) => p['mu_w' + w] || 0).filter((x) => x > 0);
    return v.length ? d3.mean(v) : (p.season_avg || 0);
  }
  function val(p, w, mine) {
    const base = p['mu_w' + w] || 0;
    if (!mine) return base;
    const o = S.ov[p.pid];
    if (!o) return base;
    if (o.ret && w < o.ret) return 0;
    if (w === D.cur && p.played_this_week) return base;
    if (o.ppg != null) return hasGame(p, w) ? o.ppg : 0;
    if (o.ret && base === 0 && hasGame(p, w)) return irEstimate(p);
    return base;
  }
  function range(p, w, mine) {
    const v = val(p, w, mine), b = p['mu_w' + w] || 0;
    const r = b > 0 ? [p['lo_w' + w] / b, p['hi_w' + w] / b] : (D.posRatio[p.pos] || [0.5, 1.5]);
    if (w === D.cur && p.played_this_week) return [v, v];
    return [v * r[0], v * r[1]];
  }
  function clean(fn) {
    const keep = { ov: S.ov, adds: S.adds, drops: S.drops, pins: S.pins, benches: S.benches };
    S.ov = {}; S.adds = new Set(); S.drops = new Set(); S.pins = new Set(); S.benches = new Set();
    try { return fn(); } finally { Object.assign(S, keep); }
  }
  const myBase = () => rows('players').filter((p) => p.owner_rid === D.me.rid).map((p) => p.pid);
  const myRoster = () => myBase().filter((id) => !S.drops.has(id)).concat([...S.adds]);
  const otherRoster = (rid, w) => rows('players').filter((p) => p.owner_rid === rid && (!p.on_ir || w >= D.cur + 4)).map((p) => p.pid);

  /* ================= lineup engine ================= */
  const ELIG = { QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'], DL: ['DL'], LB: ['LB'], DB: ['DB'], FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'], WRRB_FLEX: ['RB', 'WR'], IDP_FLEX: ['DL', 'LB', 'DB'] };
  const SLOT_LABEL = { SUPER_FLEX: 'SFLEX', REC_FLEX: 'W/T', WRRB_FLEX: 'W/R', IDP_FLEX: 'IDP' };
  const fits = (slot, p) => (ELIG[slot] || []).includes(p.pos);
  const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'];
  function lineup(ids, w, mine, opt) {
    opt = opt || {};
    const v = (p) => val(p, w, mine);
    let pl = ids.map((id) => D.P[id]).filter(Boolean);
    const slots = D.slots.map((s) => ({ slot: s, p: null, locked: false }));
    const fillOrder = slots.filter((s) => (ELIG[s.slot] || []).length === 1).concat(slots.filter((s) => (ELIG[s.slot] || []).length > 1).sort((a, b) => ELIG[a.slot].length - ELIG[b.slot].length));
    const used = new Set();
    if (mine && w === D.cur) {
      (D.me.starters || '').split(',').forEach((pid, i) => {
        const p = D.P[pid];
        if (p && p.played_this_week && ids.includes(pid) && slots[i]) { slots[i].p = p; slots[i].locked = true; used.add(pid); }
      });
    }
    const avail = pl.filter((p) => !used.has(p.pid) && !(w === D.cur && p.played_this_week));
    const pins = mine ? (opt.pins || S.pins) : new Set(), benches = mine ? (opt.benches || S.benches) : new Set();
    const put = (p) => { const s = fillOrder.find((x) => !x.p && fits(x.slot, p)); if (s) { s.p = p; used.add(p.pid); } };
    avail.filter((p) => pins.has(p.pid) && v(p) > 0).sort((a, b) => v(b) - v(a)).forEach(put);
    const cand = avail.filter((p) => !used.has(p.pid) && !benches.has(p.pid)).sort((a, b) => v(b) - v(a));
    fillOrder.forEach((s) => { if (s.p) return; const q = cand.find((p) => fits(s.slot, p) && !used.has(p.pid)); if (q) { s.p = q; used.add(q.pid); } });
    let total = 0; slots.forEach((s) => { if (s.p) total += v(s.p); });
    const bench = pl.filter((p) => !used.has(p.pid)).sort((a, b) => v(b) - v(a));
    return { total, slots, bench };
  }
  const tot = (ids, w, mine) => lineup(ids, w, mine).total;

  let otherBase = null;
  function teamMeans(myIds, overrides) {
    if (!otherBase) {
      otherBase = {};
      D.T.forEach((t) => { otherBase[t.rid] = {}; for (let w = D.cur; w <= D.maxWeek; w++) otherBase[t.rid][w] = w === D.cur ? t['exp_w' + w] : tot(otherRoster(t.rid, w), w, false); });
    }
    const m = {};
    D.T.forEach((t) => { m[t.rid] = Object.assign({}, otherBase[t.rid]); });
    for (let w = D.cur; w <= D.maxWeek; w++) m[D.me.rid][w] = tot(myIds, w, true);
    if (overrides) Object.keys(overrides).forEach((rid) => { Object.assign(m[rid], overrides[rid]); });
    return m;
  }

  /* ================= season simulator ================= */
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function makeSim(means, o) {
    const T = D.T, n = o.runs, sd = D.sd * (o.vol || S.vol), pk = o.picks || {};
    const idx = {}; T.forEach((t, i) => { idx[t.rid] = i; });
    const K = T.length, divs = D.nDiv ? [...new Set(T.map((t) => t.div_id))] : [], NP = D.nP;
    const divOf = T.map((t) => t.div_id);
    const G = D.games.map((g) => ({ w: g.week, a: idx[g.team_a], b: idx[g.team_b], ma: means[g.team_a][g.week], mb: means[g.team_b][g.week], s: sd * (g.week === D.cur ? 0.85 : 1), pick: pk[g.game] != null ? idx[pk[g.game]] : -1 }));
    const r = mulberry(o.seed || 20261016);
    let spare = null;
    const gauss = () => { if (spare != null) { const s = spare; spare = null; return s; } let u = 0; while (u === 0) u = r(); const v = r(), m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); };
    const res = { n: 0, made: new Float64Array(K), div: new Float64Array(K), seeds: T.map(() => new Float64Array(NP)), wins: new Float64Array(K), myHist: {} };
    const W0 = T.map((t) => t.wins), PF0 = T.map((t) => t.pf), meI = idx[D.me.rid];
    const Wv = new Float64Array(K), PF = new Float64Array(K), key = new Float64Array(K);
    function step(m) {
      for (let it = 0; it < m && res.n < n; it++, res.n++) {
        for (let i = 0; i < K; i++) { Wv[i] = W0[i]; PF[i] = PF0[i]; }
        for (const g of G) {
          const a = g.ma + g.s * gauss(), b = g.mb + g.s * gauss();
          PF[g.a] += a; PF[g.b] += b;
          const aw = g.pick >= 0 ? g.pick === g.a : a > b;
          if (aw) Wv[g.a]++; else Wv[g.b]++;
        }
        for (let i = 0; i < K; i++) { key[i] = Wv[i] * 10000 + PF[i]; res.wins[i] += Wv[i]; }
        const winners = [];
        for (const d of divs) { let best = -1; for (let i = 0; i < K; i++) if (divOf[i] === d && (best < 0 || key[i] > key[best])) best = i; winners.push(best); }
        winners.sort((x, y) => key[y] - key[x]);
        const rest = []; for (let i = 0; i < K; i++) if (!winners.includes(i)) rest.push(i);
        rest.sort((x, y) => key[y] - key[x]);
        const order = winners.concat(rest.slice(0, Math.max(0, NP - winners.length)));
        order.forEach((i, s) => { res.made[i]++; res.seeds[i][s]++; });
        winners.forEach((i) => { res.div[i]++; });
        const mw = Wv[meI]; const h = res.myHist[mw] || (res.myHist[mw] = { n: 0, made: 0 }); h.n++; if (order.includes(meI)) h.made++;
      }
      return res.n >= n;
    }
    function summary() {
      const out = {}; const k = res.n || 1;
      T.forEach((t, i) => { out[t.rid] = { playoff: res.made[i] / k, div: res.div[i] / k, expW: res.wins[i] / k, seeds: Array.from(res.seeds[i]).map((x) => x / k) }; });
      out.myHist = res.myHist; out.n = res.n; return out;
    }
    return { step, summary, total: n };
  }
  function simSync(means, o) { const s = makeSim(means, o); s.step(o.runs); return s.summary(); }
  const simTokens = {};
  function simAsync(means, o, onProgress, channel) {
    channel = channel || 'scen'; const token = (simTokens[channel] = (simTokens[channel] || 0) + 1); const s = makeSim(means, o); const meter = $('#simmeter > i');
    return new Promise((resolve) => {
      root.classList.add('running');
      const tick = () => {
        if (token !== simTokens[channel]) { resolve(null); return; }
        const t0 = performance.now(); let done = false;
        while (!done && performance.now() - t0 < 14) done = s.step(400);
        const frac = Math.min(1, s.summary().n / s.total);
        meter.style.width = (frac * 100) + '%';
        if (onProgress) onProgress(frac);
        if (done) { root.classList.remove('running'); setTimeout(() => { if (token === simTokens[channel]) meter.style.width = '0'; }, 500); resolve(s.summary()); }
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ================= strict clinch math ================= */
  function standingsLocked(pk) {
    const W = {}, L = {}, open = {};
    D.T.forEach((t) => { W[t.rid] = t.wins; L[t.rid] = t.losses; open[t.rid] = 0; });
    D.games.forEach((g) => {
      const win = pk && pk[g.game];
      if (win != null) { W[win]++; L[win === g.team_a ? g.team_b : g.team_a]++; }
      else { open[g.team_a]++; open[g.team_b]++; }
    });
    return { W, L, open };
  }
  // A wildcard spot needs a top-5 finish among teams that do NOT win their division, and a division winner
  // never takes a wildcard. So for team T at its floor, threats in each division can push T down by at most
  // (threats in that division - 1). Assuming every threat reaches T at once only overstates the danger,
  // so a clinch found this way is always real; the same logic run on sure-aboves proves elimination.
  function nonWinnersAbove(T, W, open, lo, mode) {
    let total = 0, ownAbove = 0;
    const hit = (o) => o.rid !== T.rid && (mode === 'threat' ? W[o.rid] + open[o.rid] >= lo : W[o.rid] > lo);
    if (!D.nDiv) return { total: D.T.filter(hit).length, ownAbove: 1 };
    const divs = [...new Set(D.T.map((t) => t.div_id))];
    divs.forEach((d) => {
      const n = D.T.filter((o) => o.div_id === d && hit(o)).length;
      if (d === T.div_id) ownAbove = n;
      total += Math.max(0, n - 1);
    });
    return { total, ownAbove };
  }
  function designations(pk) {
    const { W, open } = standingsLocked(pk);
    const out = {};
    D.T.forEach((t) => {
      const lo = W[t.rid], hi = W[t.rid] + open[t.rid];
      const th = nonWinnersAbove(t, W, open, lo, 'threat');
      const sure = nonWinnersAbove(t, W, open, hi, 'sure');
      let divClinch, clinch, divOut, elim;
      if (D.nDiv) { divClinch = th.ownAbove === 0; clinch = divClinch || th.total <= D.nWild - 1; divOut = sure.ownAbove > 0; elim = divOut && sure.total >= D.nWild; }
      else { divClinch = false; divOut = false; clinch = th.total <= D.nP - 1; elim = sure.total >= D.nP; }
      out[t.rid] = { clinch, divClinch, divOut, elim, mark: divClinch ? 'y' : clinch ? 'x' : elim ? 'e' : divOut ? 'd' : '' };
    });
    return out;
  }
  function winsToClinch(pk) {
    const { W, open } = standingsLocked(pk); const me = D.me;
    let spot = null, div = null;
    for (let k = 0; k <= open[me.rid]; k++) {
      const th = nonWinnersAbove(me, W, open, W[me.rid] + k, 'threat');
      if (D.nDiv && div == null && th.ownAbove === 0) div = k;
      if (spot == null && (D.nDiv ? (th.ownAbove === 0 || th.total <= D.nWild - 1) : th.total <= D.nP - 1)) spot = k;
    }
    let winOut = false;
    if (spot == null && open[me.rid] > 0) {
      const pk2 = Object.assign({}, pk || {});
      D.games.forEach((g) => { if (pk2[g.game] == null && (g.team_a === me.rid || g.team_b === me.rid)) pk2[g.game] = me.rid; });
      if (designations(pk2)[me.rid].clinch) { spot = open[me.rid]; winOut = true; }
    }
    return { spot, div, open: open[me.rid], winOut };
  }
  function tier(p) { return p >= 0.99 ? ['Lock', 'solid-ok'] : p >= 0.75 ? ['Likely', 'ok'] : p >= 0.35 ? ['Bubble', 'warn'] : p >= 0.01 ? ['Long shot', 'bad'] : ['Done', 'solid-bad']; }
  function markEl(m) { const s = el('span', 'mark ' + (m || 'none'), m || '·'); s.setAttribute('aria-hidden', 'true'); return s; }

  /* ================= results state ================= */
  const R = { base: null, scen: null, mach: null };
  let scenTimer = null, machTimer = null;
  function recompute() {
    clearTimeout(scenTimer);
    scenTimer = setTimeout(async () => {
      const ids = myRoster();
      if (!scenActive()) { R.scen = R.base; drawAll(); if (Object.keys(picks).length) recomputeMachine(); return; }
      const res = await simAsync(teamMeans(ids), { runs: S.runs, vol: S.vol });
      if (res) { R.scen = res; drawAll(); flash('#headline'); if (Object.keys(picks).length) recomputeMachine(); }
    }, 140);
  }
  function recomputeMachine() {
    clearTimeout(machTimer);
    machTimer = setTimeout(() => { R.mach = simSync(teamMeans(myRoster()), { runs: 6000, vol: S.vol, picks }); drawMachine(); }, 60);
  }
  const live = () => R.scen || R.base;

  /* ================= motion helpers ================= */
  function tween(node, to, fmt, dur) {
    const from = Number(node.dataset.v);
    node.dataset.v = String(to);
    if (reduced || !isFinite(from) || from === to) { node.textContent = fmt(to); return; }
    const t0 = performance.now(); dur = dur || 650;
    const run = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); node.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(run); };
    requestAnimationFrame(run);
  }
  function flash(sel) { const n = $(sel); if (!n || reduced) return; n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); }
  function barClass(p) { return 'bar ' + (p >= 0.65 ? '' : p >= 0.35 ? 'gold' : 'red'); }
  function setBar(barEl, frac) { barEl.className = barClass(frac); barEl.firstElementChild.style.width = (Math.max(0, Math.min(1, frac)) * 100) + '%'; }
  function oddsCell(p) { const g = el('div', 'oddcell'), b = el('div', barClass(p)), i = el('i'); b.append(i); g.append(el('span', null, oddsTxt(p)), b); requestAnimationFrame(() => { i.style.width = (p * 100) + '%'; }); return g; }

  /* ================= tabs ================= */
  const panes = ['race', 'machine', 'lineup', 'lab', 'waivers', 'trades', 'method'];
  let pane = 'race';
  function moveInk() { const b = $('#tab-' + pane), ink = $('#tab-ink'); if (!b || !ink) return; ink.style.left = b.offsetLeft + 'px'; ink.style.width = b.offsetWidth + 'px'; ink.style.top = (b.offsetTop + b.offsetHeight - 1) + 'px'; }
  function show(name) {
    pane = name;
    panes.forEach((p) => { const n = $('#' + p); n.hidden = p !== name; $('#tab-' + p).setAttribute('aria-selected', String(p === name)); });
    const n = $('#' + name); n.classList.remove('enter'); void n.offsetWidth; n.classList.add('enter');
    dash.setLink(name); moveInk(); drawPane();
  }
  $$('#tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.pane)));

  function seg(box, opts, cur, set) {
    box.replaceChildren(...opts.map(([v, label]) => { const b = el('button', null, label); b.type = 'button'; b.setAttribute('aria-pressed', String(cur === v)); b.addEventListener('click', () => { set(v); drawPane(); }); return b; }));
  }

  /* ================= header ================= */
  let firstDraw = true;
  function drawHeader() {
    const me = D.me, base = R.base, sc = live();
    $('#kpi-odds').textContent = pct(me.playoff_pct); $('#kpi-odds').classList.remove('dash-skeleton');
    $('#kpi-wins').textContent = f1(me.exp_wins);
    root.querySelectorAll('[data-me]').forEach((s) => { s.dataset.where = 'rid=' + me.rid; });
    $$('.me-name').forEach((n) => { n.textContent = me.team; });
    root.querySelectorAll('[data-source="teams"][data-me]').forEach((s) => {
      const f = s.dataset.field; if (f === 'playoff_pct' || f === 'exp_wins') return;
      const v = me[f]; s.textContent = f === 'pf' || f === 'pa' ? f2(v) : f === 'faab_left' ? comma(v) : String(v);
    });
    root.querySelectorAll('[data-source="model"][data-field="value"]').forEach((s) => {
      const k = new URLSearchParams(s.dataset.where).get('metric'); const v = D.m[k]; if (v == null) return;
      s.textContent = k === 'band_coverage_20_80' ? pct1(v) : k === 'sim_runs' ? comma(v) : String(v);
    });
    setBar($('#kpi-faab-bar').parentElement, D.budget ? me.faab_left / D.budget : 0); $$('.budget').forEach((n) => { n.textContent = comma(D.budget); }); $('#kpi-faab-bar').parentElement.className = 'bar gold';
    const p = scenActive() && sc ? sc[me.rid].playoff : me.playoff_pct;
    setBar($('#kpi-odds-bar').parentElement, p);
    const chip = $('#kpi-odds-chip'), wchip = $('#kpi-wins-chip');
    if (scenActive() && sc && base) {
      const d = sc[me.rid].playoff - base[me.rid].playoff;
      chip.hidden = false; chip.className = 'chip ' + (d > 0.005 ? 'up' : d < -0.005 ? 'down' : 'flat'); chip.textContent = 'what-if ' + pct(sc[me.rid].playoff) + ' (' + spct(d) + ')';
      const dw = sc[me.rid].expW - base[me.rid].expW;
      wchip.hidden = false; wchip.className = 'chip ' + (dw > 0.05 ? 'up' : dw < -0.05 ? 'down' : 'flat'); wchip.textContent = 'what-if ' + f1(sc[me.rid].expW);
      $('#kpi-odds-sub').textContent = 'Model run vs your what-if, ' + comma(sc.n) + ' simulated seasons';
    } else { chip.hidden = true; wchip.hidden = true; $('#kpi-odds-sub').textContent = 'Share of ' + comma(D.m.sim_runs) + ' simulated seasons ending in the top ' + D.nP; }
    const des = designations({})[me.rid], st = $('#kpi-status');
    st.replaceChildren();
    const [tn, tc] = des.clinch ? ['Clinched', 'solid-ok'] : des.elim ? ['Eliminated', 'solid-bad'] : tier(p);
    st.append(el('span', 'pill ' + tc, tn));
    const wc = winsToClinch({});
    $('#kpi-magic').textContent = des.clinch ? 'In the playoffs whatever happens' : des.elim ? 'No path left' : wc.winOut ? 'Win all ' + wc.open + ' left to clinch outright; otherwise you need help' : wc.spot != null ? 'Win ' + wc.spot + ' of ' + wc.open + ' left to clinch a spot outright' : 'Can’t clinch on your own wins yet; needs help';
    const sorted = D.T.slice().sort((a, b) => (sc ? sc[b.rid].playoff - sc[a.rid].playoff : b.playoff_pct - a.playoff_pct));
    const rank = sorted.findIndex((t) => isMe(t)) + 1;
    const t = $('#takeaway'); t.replaceChildren();
    t.append(D.me.team + ' make the playoffs in ', el('b', null, pct(p)), ' of simulated seasons' + (scenActive() ? ' with your what-if' : '') + ', the ' + ordinal(rank) + '-best odds in the league' + (rank <= D.nP ? ', inside the ' + D.nP + '-team cut. ' : ', outside the ' + D.nP + '-team cut. '));
    const wv = waiverBoard(), top = wv.list[0];
    if (top) t.append('Best move on the wire: ', el('b', null, top.p.player), ' for ', el('b', null, top.drop.player), ', ', el('b', null, signed(top.gain)), ' lineup points through week ' + D.last + '.');
    if (firstDraw) { root.classList.add('wr-ready'); firstDraw = false; }
    drawScenBanner();
  }
  function scenWords() {
    const w = [];
    Object.entries(S.ov).forEach(([pid, o]) => { const p = D.P[pid]; if (!p) return; const bits = []; if (o.ret) bits.push('back week ' + o.ret); if (o.ppg != null) bits.push(f1(o.ppg) + ' pts/game'); w.push(p.player + ' ' + bits.join(', ')); });
    if (S.adds.size) w.push('add ' + [...S.adds].map((id) => D.P[id].player).join(', '));
    if (S.drops.size) w.push('drop ' + [...S.drops].map((id) => D.P[id].player).join(', '));
    if (S.pins.size) w.push('always start ' + [...S.pins].map((id) => D.P[id].player).join(', '));
    if (S.benches.size) w.push('never start ' + [...S.benches].map((id) => D.P[id].player).join(', '));
    if (S.vol !== 1) w.push('weekly swing ' + f2(S.vol) + '×');
    return w;
  }
  function drawScenBanner() {
    const b = $('#scen'), on = !!scenActive();
    if (on && b.hidden) { b.hidden = false; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
    if (!on) b.hidden = true;
    if (!on) return;
    $('#scen-what').textContent = scenWords().join(' · ');
    const sc = live(), base = R.base;
    if (sc && base) { const d = sc[D.me.rid].playoff - base[D.me.rid].playoff; const c = $('#scen-odds'); c.className = 'chip ' + (d > 0.005 ? 'up' : d < -0.005 ? 'down' : 'flat'); c.textContent = pct(base[D.me.rid].playoff) + ' → ' + pct(sc[D.me.rid].playoff) + ' (' + spct(d) + ')'; }
  }
  $('#scen-reset').addEventListener('click', () => { S.ov = {}; S.adds.clear(); S.drops.clear(); S.pins.clear(); S.benches.clear(); S.vol = 1; $('#lab-vol').value = '1'; $('#lab-vol-v').textContent = '1.00×'; recompute(); drawAll(); recomputeMachine(); });
  $('#scen-edit').addEventListener('click', () => show('lab'));

  /* ================= race ================= */
  let divPick = 'all', openTeam = null;
  function drawRace() {
    const sc = live(), useLive = scenActive() && sc;
    ['th-odds', 'th-div', 'th-expw'].forEach((id, k) => { const th = $('#' + id); if (useLive) th.removeAttribute('data-field'); else th.setAttribute('data-field', ['playoff_pct', 'div_win_pct', 'exp_wins'][k]); });
    const odds = (t) => (useLive ? sc[t.rid].playoff : t.playoff_pct);
    const divp = (t) => (useLive ? sc[t.rid].div : t.div_win_pct);
    const expw = (t) => (useLive ? sc[t.rid].expW : t.exp_wins);
    const divs = [...new Set(D.T.map((t) => t.division))];
    seg($('#div-filter'), [['all', 'All teams']].concat(divs.map((d) => [d, d])), divPick, (v) => { divPick = v; });
    const des = designations({});
    const ap = {}; (dash.data('allplay').data || []).forEach((r) => { ap[r.team] = r; });
    const all = D.T.slice().sort((a, b) => odds(b) - odds(a) || b.wins - a.wins || b.pf - a.pf);
    const list = all.filter((t) => divPick === 'all' || t.division === divPick);
    const tb = $('#standings-table tbody'); tb.replaceChildren();
    list.forEach((t) => {
      const tr = el('tr', 'click' + (isMe(t) ? ' me' : '')); tr.tabIndex = 0; tr.dataset.key = t.team;
      if (divPick === 'all' && all.indexOf(t) === D.nP - 1) tr.classList.add('cut');
      const nm = el('td'); nm.append(markEl(des[t.rid].mark), el('span', 'pname', t.team));
      tr.append(el('td', 'n dim', String(all.indexOf(t) + 1)), nm, el('td', 'hide-sm dim', t.division), el('td', 'n', String(t.wins)), el('td', 'n', String(t.losses)), el('td', 'n', f2(t.pf)), el('td', 'n hide-sm dim', ap[t.team] ? ap[t.team].allplay : ''));
      const oc = el('td'); oc.append(oddsCell(odds(t))); tr.append(oc);
      tr.append(el('td', 'n hide-sm', oddsTxt(divp(t))), el('td', 'n', f1(expw(t))));
      const [tn, tc] = des[t.rid].clinch ? ['Clinched', 'solid-ok'] : des[t.rid].elim ? ['Eliminated', 'solid-bad'] : tier(odds(t));
      const st = el('td'); st.append(el('span', 'pill ' + tc, tn)); tr.append(st);
      const toggle = () => { openTeam = openTeam === t.rid ? null : t.rid; drawRace(); };
      tr.addEventListener('click', toggle); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      tb.append(tr);
      const dr = el('tr', 'detail-row'), td = el('td'); td.colSpan = 11; const wrap = el('div', 'detail'), inner = el('div');
      wrap.append(inner); td.append(wrap); dr.append(td); tb.append(dr);
      if (openTeam === t.rid) { inner.append(teamDetail(t, sc, ap[t.team])); requestAnimationFrame(() => wrap.classList.add('open')); }
    });
    const c = D.T.filter((t) => des[t.rid].clinch).length, e = D.T.filter((t) => des[t.rid].elim).length;
    $('#clinch-line').textContent = c + e === 0 ? 'No team has clinched or been eliminated yet.' : c + ' clinched · ' + e + ' eliminated';
    drawHeat(sc, useLive); drawWins(sc); drawPath();
  }
  function teamDetail(t, sc, ap) {
    const box = el('div', 'inner');
    const H = rows('history').filter((h) => h.rid === t.rid && h.final).sort((a, b) => a.week - b.week);
    const s1 = el('div', 'stat'); s1.append(el('span', 'micro', 'Weekly scores'), spark(H.map((h) => ({ x: h.week, y: h.pts, win: h.pts > h.opp_pts })), 220, 54));
    const s2 = el('div', 'stat'); const apw = ap ? ap.allplay_pct : 0, luck = t.wins - apw * (t.wins + t.losses);
    s2.append(el('span', 'micro', 'All-play'), el('span', 'v', ap ? ap.allplay : '—'), el('span', 'note', (luck > 0.4 ? signed(luck) + ' wins of good luck' : luck < -0.4 ? signed(luck) + ' wins of bad luck' : 'Record matches its scoring')));
    const opps = D.games.filter((g) => g.week > D.cur && (g.team_a === t.rid || g.team_b === t.rid)).map((g) => (g.team_a === t.rid ? g.team_b : g.team_a));
    const means = teamMeans(myRoster()); const sos = d3.mean(opps.map((o, i) => means[o][D.cur + 1 + i] || 0));
    const leagueAvg = d3.mean(D.T.map((x) => means[x.rid][D.cur + 1]));
    const s3 = el('div', 'stat'); s3.append(el('span', 'micro', 'Remaining schedule'), el('span', 'v', f1(sos)), el('span', 'note', 'avg projected opponent score, ' + (sos > leagueAvg + 1.5 ? 'tougher' : sos < leagueAvg - 1.5 ? 'softer' : 'about') + ' than league average (' + f1(leagueAvg) + ')'));
    const s4 = el('div', 'stat'); s4.append(el('span', 'micro', 'Top players, rest of season'));
    const ids = isMe(t) ? myRoster() : rows('players').filter((p) => p.owner_rid === t.rid).map((p) => p.pid);
    const ul = el('ul', 'plain');
    ids.map((id) => D.P[id]).filter(Boolean).map((p) => [p, d3.sum(D.weeks.filter((w) => w > D.cur && w <= D.last), (w) => val(p, w, isMe(t)))]).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .forEach(([p, v]) => { const li = el('li'); li.append(el('span', 'pname', p.player), el('span', 'dim', ' ' + p.pos + ' · ' + f1(v / Math.max(1, D.last - D.cur)) + '/wk')); ul.append(li); });
    s4.append(ul);
    const s5 = el('div', 'stat'); s5.append(el('span', 'micro', 'Seed chances'));
    if (sc) { const seeds = sc[t.rid].seeds; const line = el('div', 'note'); line.textContent = seeds.map((v, i) => (v >= 0.01 ? ordinal(i + 1) + ' ' + pct(v) : null)).filter(Boolean).join(' · ') || 'Misses the playoffs in almost every run'; s5.append(line); }
    box.append(s1, s2, s3, s4, s5);
    return box;
  }
  function spark(pts, w, h) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('width', '100%'); svg.style.maxWidth = w + 'px';
    if (!pts.length) return svg;
    const x = d3.scaleLinear([d3.min(pts, (p) => p.x), d3.max(pts, (p) => p.x)], [8, w - 8]), y = d3.scaleLinear([d3.min(pts, (p) => p.y) - 8, d3.max(pts, (p) => p.y) + 8], [h - 14, 6]);
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', d3.line((p) => x(p.x), (p) => y(p.y))(pts)); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'var(--ink-2)'); path.setAttribute('stroke-width', '1.5'); path.setAttribute('stroke-linejoin', 'round'); svg.append(path);
    pts.forEach((p) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x(p.x)); c.setAttribute('cy', y(p.y)); c.setAttribute('r', 3.2); c.setAttribute('fill', p.win ? 'var(--green)' : 'var(--red)'); svg.append(c); const tx = document.createElementNS(NS, 'text'); tx.setAttribute('x', x(p.x)); tx.setAttribute('y', h - 2); tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('class', 'ax'); tx.setAttribute('fill', 'var(--ink-3)'); tx.setAttribute('font-size', '9'); tx.textContent = Math.round(p.y); svg.append(tx); });
    return svg;
  }
  function drawHeat(sc, useLive) {
    const box = $('#heat'); box.replaceChildren();
    box.append(el('div', 'h', ''));
    box.style.gridTemplateColumns = 'minmax(7rem, 1.6fr) repeat(' + (D.nP + 1) + ', minmax(2.2rem, 1fr))';
    for (let s = 1; s <= D.nP; s++) box.append(el('div', 'h', ordinal(s)));
    box.append(el('div', 'h', 'Out'));
    const seeds = (t) => (useLive ? sc[t.rid].seeds : d3.range(1, D.nP + 1).map((s) => t['seed' + s + '_pct'] || 0));
    const order = D.T.slice().sort((a, b) => d3.sum(seeds(b)) - d3.sum(seeds(a)));
    const green = d3.interpolateRgb('#e9e4d8', '#2d5a27'), gold = d3.interpolateRgb('#e9e4d8', '#c4922a'), red = d3.interpolateRgb('#e9e4d8', '#8b3a1a');
    order.forEach((t) => {
      const nm = el('div', 't' + (isMe(t) ? ' pname' : ''), t.team); box.append(nm);
      const s = seeds(t); const outp = 1 - d3.sum(s);
      s.concat([outp]).forEach((v, i) => {
        const c = el('div', 'c' + (v < 0.01 ? ' lo' : ''), v >= 0.995 ? '99' : String(Math.round(v * 100)));
        const k = Math.pow(Math.min(1, v), 0.6);
        c.style.backgroundColor = (i < D.nDiv ? green : i < D.nP ? gold : red)(k);
        if (k > 0.55) c.style.color = '#faf8f3';
        c.title = t.team + ': ' + (i < D.nP ? ordinal(i + 1) + ' seed ' : 'miss playoffs ') + pct1(v);
        box.append(c);
      });
    });
  }
  function drawWins(sc) {
    const box = $('#wins-chart'); box.replaceChildren();
    if (!sc || !sc.myHist) return;
    const H = Object.entries(sc.myHist).map(([w, h]) => ({ w: +w, n: h.n, p: h.made / h.n })).sort((a, b) => a.w - b.w);
    const tot = d3.sum(H, (h) => h.n), width = Math.max(300, box.clientWidth || 480), height = 190, m = { t: 22, r: 8, b: 28, l: 8 };
    const x = d3.scaleBand(H.map((h) => h.w), [m.l, width - m.r]).padding(0.22), y = d3.scaleLinear([0, d3.max(H, (h) => h.n / tot)], [height - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%');
    const g = svg.selectAll('g.b').data(H).join('g');
    const rect = g.append('rect').attr('x', (h) => x(h.w)).attr('width', x.bandwidth()).attr('rx', 2)
      .attr('fill', (h) => (h.p >= 0.75 ? 'var(--green)' : h.p >= 0.35 ? 'var(--gold)' : 'var(--red)')).attr('opacity', (h) => (h.n / tot < 0.01 ? 0.35 : 0.9))
      .attr('y', height - m.b).attr('height', 0);
    if (reduced) rect.attr('y', (h) => y(h.n / tot)).attr('height', (h) => height - m.b - y(h.n / tot));
    else rect.transition().duration(700).delay((h, i) => i * 40).attr('y', (h) => y(h.n / tot)).attr('height', (h) => height - m.b - y(h.n / tot));
    g.append('text').attr('class', 'ax').attr('x', (h) => x(h.w) + x.bandwidth() / 2).attr('y', height - 10).attr('text-anchor', 'middle').text((h) => h.w + 'W');
    g.append('text').attr('class', 'ax').attr('x', (h) => x(h.w) + x.bandwidth() / 2).attr('y', (h) => y(h.n / tot) - 6).attr('text-anchor', 'middle').attr('fill', 'var(--ink)').text((h) => (h.n / tot >= 0.02 ? pct(h.p) : ''));
    const tip = el('div', 'tip'); tip.hidden = true; box.append(tip);
    g.on('mousemove', (ev, h) => { tip.hidden = false; tip.replaceChildren(el('div', 'k', h.w + ' final wins'), el('div', null, pct1(h.n / tot) + ' of seasons'), el('div', null, pct(h.p) + ' make the playoffs')); const r = box.getBoundingClientRect(); let lx = ev.clientX - r.left + 10; if (lx > r.width - 150) lx -= 160; tip.style.left = lx + 'px'; tip.style.top = Math.max(0, ev.clientY - r.top - 40) + 'px'; }).on('mouseleave', () => { tip.hidden = true; });
  }
  function winProb(a, b) { const z = (a - b) / (Math.SQRT2 * D.sd * S.vol); return 0.5 * (1 + erf(z / Math.SQRT2)); }
  function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
  function drawPath() {
    const tb = $('#path-table tbody'); tb.replaceChildren();
    const means = teamMeans(myRoster());
    D.games.filter((g) => g.team_a === D.me.rid || g.team_b === D.me.rid).sort((a, b) => a.week - b.week).forEach((g) => {
      const o = g.team_a === D.me.rid ? g.team_b : g.team_a, a = means[D.me.rid][g.week], b = means[o][g.week], p = winProb(a, b);
      const tr = el('tr'), wp = el('td'); const bar = el('div', 'oddcell'); const bb = el('div', barClass(p)), i = el('i'); bb.append(i); bar.append(el('span', p >= 0.55 ? 'pos-c' : p <= 0.45 ? 'neg-c' : 'gold-c', pct(p)), bb); wp.append(bar); requestAnimationFrame(() => { i.style.width = p * 100 + '%'; });
      tr.append(el('td', 'n', String(g.week)), el('td', null, D.byRid[o].team), el('td', 'n', f1(a)), el('td', 'n dim', f1(b)), wp);
      tb.append(tr);
    });
  }

  /* ================= playoff machine ================= */
  let machWeek = null;
  function drawMachine() {
    if (machWeek == null) machWeek = D.cur;
    const wk = $('#mach-weeks'); wk.replaceChildren();
    for (let w = D.cur; w <= D.last; w++) {
      const b = el('button', null, 'Wk ' + w); b.type = 'button'; b.setAttribute('aria-pressed', String(w === machWeek));
      if (D.games.some((g) => g.week === w && picks[g.game] != null)) b.append(el('span', 'dot'));
      b.addEventListener('click', () => { machWeek = w; drawMachine(); }); wk.append(b);
    }
    const means = teamMeans(myRoster());
    const box = $('#mach-games'); box.replaceChildren();
    D.games.filter((g) => g.week === machWeek).forEach((g) => {
      const row = el('div', 'game'), pk = picks[g.game];
      const side = (rid, right) => {
        const t = D.byRid[rid], b = el('button', 'side' + (right ? ' r' : '') + (isMe(t) ? ' me' : '') + (pk === rid ? ' win' : pk != null ? ' lose' : '')); b.type = 'button';
        b.append(el('span', 'nm', t.team), el('span', 'meta', t.wins + '–' + t.losses + ' · proj ' + f1(means[rid][g.week])));
        b.setAttribute('aria-pressed', String(pk === rid));
        b.addEventListener('click', () => { if (picks[g.game] === rid) delete picks[g.game]; else picks[g.game] = rid; drawMachine(); recomputeMachine(); });
        return b;
      };
      const p = winProb(means[g.team_a][g.week], means[g.team_b][g.week]);
      const vs = el('div', 'vs'); vs.append(el('span', null, 'VS'), el('span', 'wp', pct(Math.max(p, 1 - p)) + (p >= 0.5 ? ' ◂' : ' ▸')));
      row.append(side(g.team_a, false), vs, side(g.team_b, true)); box.append(row);
    });
    const n = Object.keys(picks).length;
    $('#mach-count').textContent = n ? n + ' of ' + D.games.length + ' remaining games picked.' : 'No picks yet. Click a team to pick it to win.';
    const res = R.mach || live();
    const des = designations(picks), lk = standingsLocked(picks);
    const tb = $('#mach-table tbody'); tb.replaceChildren();
    if (!res) return;
    const ord = D.T.slice().sort((a, b) => res[b.rid].playoff - res[a.rid].playoff || lk.W[b.rid] - lk.W[a.rid]);
    ord.forEach((t, i) => {
      const tr = el('tr', isMe(t) ? 'me' : ''); if (i === D.nP - 1) tr.classList.add('cut');
      const nm = el('td'); nm.append(markEl(des[t.rid].mark), el('span', 'pname', t.team));
      const oc = el('td'); oc.append(oddsCell(res[t.rid].playoff));
      tr.append(el('td', 'n dim', String(i + 1)), nm, el('td', 'n', lk.W[t.rid] + '–' + lk.L[t.rid]), el('td', 'n dim', String(lk.open[t.rid])), el('td', 'n hide-sm', f1(res[t.rid].expW)), oc);
      tb.append(tr);
    });
    const wc = winsToClinch(picks), mine = res[D.me.rid];
    const m = $('#mach-summary'); m.replaceChildren();
    m.append(D.me.team + ': ', el('b', null, pct(mine.playoff)), ' to make it, ' + pct(mine.div) + ' to win the division. ');
    m.append(des[D.me.rid].clinch ? 'Clinched with these picks.' : des[D.me.rid].elim ? 'Eliminated with these picks.' : wc.winOut ? 'Win all ' + wc.open + ' of your open games to clinch outright.' : wc.spot != null ? 'Win ' + wc.spot + ' of your ' + wc.open + ' open games to clinch outright.' : 'No number of your own wins guarantees a spot yet.');
  }
  function favorites(onlyWeek) {
    const means = teamMeans(myRoster());
    D.games.filter((g) => !onlyWeek || g.week === machWeek).forEach((g) => { picks[g.game] = means[g.team_a][g.week] >= means[g.team_b][g.week] ? g.team_a : g.team_b; });
    drawMachine(); recomputeMachine();
  }
  $('#mach-fav-week').addEventListener('click', () => favorites(true));
  $('#mach-fav-all').addEventListener('click', () => favorites(false));
  $('#mach-me-win').addEventListener('click', () => { D.games.filter((g) => g.team_a === D.me.rid || g.team_b === D.me.rid).forEach((g) => { picks[g.game] = D.me.rid; }); drawMachine(); recomputeMachine(); });
  $('#mach-clear').addEventListener('click', () => { Object.keys(picks).forEach((k) => delete picks[k]); drawMachine(); recomputeMachine(); });

  /* ================= lineup ================= */
  let luWeek = null;
  function gradeOf(dv) { return dv == null ? ['', 'no data'] : dv >= 1.15 ? ['soft', 'soft matchup'] : dv <= 0.87 ? ['tough', 'tough matchup'] : ['mid', 'average matchup']; }
  function drawLineup() {
    if (luWeek == null) luWeek = D.cur;
    const wk = $('#lu-weeks'); wk.replaceChildren();
    D.weeks.forEach((w) => { const b = el('button', w > D.last ? 'po' : '', 'Wk ' + w); b.type = 'button'; b.setAttribute('aria-pressed', String(w === luWeek)); b.title = w > D.last ? 'Fantasy playoff week' : ''; b.addEventListener('click', () => { luWeek = w; drawLineup(); }); wk.append(b); });
    const w = luWeek, ids = myRoster(), L = lineup(ids, w, true), opt = lineup(ids, w, true, { pins: new Set(), benches: new Set() });
    const rowsAll = L.slots.filter((s) => s.p).map((s) => ({ slot: s.slot, p: s.p, locked: s.locked, start: true })).concat(L.bench.map((p) => ({ slot: 'BN', p, start: false })));
    const maxHi = d3.max(rowsAll, (r) => range(r.p, w, true)[1]) || 1;
    const sleeper = new Set((D.me.starters || '').split(','));
    const tb = $('#lu-table tbody'); tb.replaceChildren();
    rowsAll.forEach((r) => {
      const p = r.p, v = val(p, w, true), [lo, hi] = range(p, w, true), tr = el('tr', r.start ? '' : 'bn');
      const nm = el('td'); nm.append(el('span', 'pname', p.player), el('span', 'dim', ' ' + p.pos + ' · ' + (p.nfl || '')));
      if (p.on_ir && !S.ov[p.pid]) nm.append(' ', el('span', 'pill mute', 'IR'));
      else if (p.injury && !(S.ov[p.pid] && S.ov[p.pid].ret && w >= S.ov[p.pid].ret)) nm.append(' ', el('span', 'pill warn', p.injury));
      if (S.adds.has(p.pid)) nm.append(' ', el('span', 'pill ok', 'added'));
      if (w === D.cur && r.start && !sleeper.has(p.pid) && !r.locked) nm.append(el('span', 'pos-c', '  ↑ start'));
      if (w === D.cur && !r.start && sleeper.has(p.pid)) nm.append(el('span', 'neg-c', '  ↓ bench'));
      const opp = p['opp_w' + w] || 'BYE', [gc, gl] = gradeOf(p['dvp_w' + w]);
      const oc = el('td', 'hide-sm'); if (opp === 'BYE') oc.append(el('span', 'pill mute', 'bye')); else { const dot = el('span', 'grade ' + gc); dot.title = gl + (p['dvp_w' + w] ? ' (' + f2(p['dvp_w' + w]) + '×)' : ''); oc.append(dot, el('span', null, opp)); }
      const rc = el('td'), rg = el('div', 'rng'), tr2 = el('div', 'track'), sp = el('div', 'span'), mu = el('div', 'mu');
      rg.append(tr2, sp, mu); rc.append(rg);
      requestAnimationFrame(() => { sp.style.left = (lo / maxHi * 100) + '%'; sp.style.width = ((hi - lo) / maxHi * 100) + '%'; mu.style.left = (v / maxHi * 100) + '%'; });
      rg.title = 'floor ' + f1(lo) + ' · expected ' + f1(v) + ' · ceiling ' + f1(hi);
      const tc = el('td', 'n');
      if (r.locked || (w === D.cur && p.played_this_week)) tc.append(el('span', 'dim', 'played'));
      else {
        const pin = el('button', 'tog pin', 'pin'), ben = el('button', 'tog bench', 'bench'); pin.type = ben.type = 'button';
        pin.setAttribute('aria-pressed', String(S.pins.has(p.pid))); ben.setAttribute('aria-pressed', String(S.benches.has(p.pid)));
        pin.addEventListener('click', () => { if (S.pins.has(p.pid)) S.pins.delete(p.pid); else { S.pins.add(p.pid); S.benches.delete(p.pid); } drawLineup(); recompute(); });
        ben.addEventListener('click', () => { if (S.benches.has(p.pid)) S.benches.delete(p.pid); else { S.benches.add(p.pid); S.pins.delete(p.pid); } drawLineup(); recompute(); });
        tc.append(pin, ' ', ben);
      }
      tr.append(el('td', 'micro', SLOT_LABEL[r.slot] || r.slot), nm, oc, rc, el('td', 'n' + (r.start ? '' : ' dim'), f1(v)), tc);
      tb.append(tr);
    });
    const tt = el('tr', 'total'); tt.append(el('td', 'micro', 'Total'), el('td', null, 'Starting lineup'), el('td', 'hide-sm', ''), el('td', ''), el('td', 'n', f1(L.total)), el('td', ''));
    tb.append(tt);
    const lt = $('#lu-total'); lt.replaceChildren();
    lt.append('Expected ', el('b', null, f1(L.total)));
    if (L.total < opt.total - 0.05) lt.append(' · pins cost ', el('span', 'neg-c', f1(opt.total - L.total)), ' vs the best lineup');
    else lt.append(' · best possible');
    drawTodo(); drawSeasonChart();
  }
  function drawTodo() {
    const todo = $('#todo'), was = new Set($$('#todo input:checked').map((i) => i.id)); todo.replaceChildren();
    const L = lineup(myRoster(), D.cur, true), sleeper = (D.me.starters || '').split(',');
    const starts = L.slots.filter((s) => s.p && !s.locked).map((s) => s.p), ins = starts.filter((p) => !sleeper.includes(p.pid));
    const outs = sleeper.map((id) => D.P[id]).filter((p) => p && !p.played_this_week && !starts.includes(p));
    const items = ins.map((p, k) => ['t-start-' + p.pid, 'Start ' + p.player + (outs[k] ? ' over ' + outs[k].player : '') + ' (' + f1(val(p, D.cur, true)) + ' expected)']);
    [...S.drops].forEach((id) => items.push(['t-drop-' + id, 'Drop ' + D.P[id].player + ' in Sleeper']));
    [...S.adds].forEach((id) => items.push(['t-add-' + id, 'Add ' + D.P[id].player + ' in Sleeper']));
    const wv = waiverBoard().list.slice(0, 2);
    wv.forEach((x) => items.push(['t-wv-' + x.p.pid, 'Consider adding ' + x.p.player + ' for ' + x.drop.player + ' (' + signed(x.gain) + ' pts, bid $' + x.bid + ' if he’s on waivers)']));
    starts.filter((p) => /Questionable|Doubtful/.test(p.injury || '')).forEach((p) => items.push(['t-q-' + p.pid, 'Check ' + p.player + '’s status before kickoff (' + p.injury.toLowerCase() + ')']));
    if (!items.length) items.push(['t-none', 'Your lineup is already set right.']);
    items.forEach(([id, text]) => { const li = el('li'), lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = was.has(id); lab.htmlFor = id; lab.append(cb, el('span', null, text)); li.append(lab); todo.append(li); });
  }
  function drawSeasonChart() {
    const box = $('#season-chart'); box.replaceChildren();
    const ids = myRoster(), weeks = D.weeks;
    const mine = weeks.map((w) => ({ w, v: tot(ids, w, true) }));
    const lg = weeks.map((w) => ({ w, v: d3.mean(D.T.filter((t) => !isMe(t)), (t) => (w === D.cur ? t['exp_w' + w] : tot(otherRoster(t.rid, w), w, false))) }));
    const width = Math.max(300, box.clientWidth || 480), height = 200, m = { t: 14, r: 52, b: 26, l: 34 };
    const x = d3.scaleLinear([weeks[0], Math.max(weeks[weeks.length - 1], weeks[0] + 1)], [m.l, width - m.r]);
    const all = mine.concat(lg).map((d) => d.v);
    const y = d3.scaleLinear([Math.floor((d3.min(all) - 8) / 10) * 10, Math.ceil((d3.max(all) + 8) / 10) * 10], [height - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%');
    svg.append('rect').attr('x', x(Math.max(weeks[0], D.last + 0.5))).attr('y', m.t).attr('width', Math.max(0, x(D.maxWeek) - x(Math.max(weeks[0], D.last + 0.5)) + 6)).attr('height', height - m.b - m.t).attr('fill', 'var(--gold-soft)');
    svg.append('text').attr('class', 'ax').attr('x', x(d3.mean(D.po))).attr('y', m.t + 11).attr('text-anchor', 'middle').text('playoffs');
    y.ticks(4).forEach((t) => { svg.append('line').attr('class', 'gl').attr('x1', m.l).attr('x2', width - m.r).attr('y1', y(t)).attr('y2', y(t)); svg.append('text').attr('class', 'ax').attr('x', m.l - 6).attr('y', y(t) + 3).attr('text-anchor', 'end').text(t); });
    weeks.forEach((w) => svg.append('text').attr('class', 'ax').attr('x', x(w)).attr('y', height - 8).attr('text-anchor', 'middle').text(w));
    const line = d3.line((d) => x(d.w), (d) => y(d.v));
    svg.append('path').attr('d', line(lg)).attr('fill', 'none').attr('stroke', 'var(--ink-3)').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
    const pth = svg.append('path').attr('d', line(mine)).attr('fill', 'none').attr('stroke', 'var(--green)').attr('stroke-width', 2.2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    if (!reduced) { const len = pth.node().getTotalLength ? pth.node().getTotalLength() : 0; if (len) pth.attr('stroke-dasharray', len + ' ' + len).attr('stroke-dashoffset', len).transition().duration(900).attr('stroke-dashoffset', 0); }
    svg.selectAll('circle.m').data(mine).join('circle').attr('cx', (d) => x(d.w)).attr('cy', (d) => y(d.v)).attr('r', 3).attr('fill', 'var(--green)');
    const lastM = mine[mine.length - 1], lastL = lg[lg.length - 1];
    let ym = y(lastM.v), yl = y(lastL.v); if (Math.abs(ym - yl) < 12) { if (ym < yl) { ym -= 6; yl += 6; } else { ym += 6; yl -= 6; } }
    svg.append('text').attr('class', 'ax').attr('x', width - m.r + 6).attr('y', ym + 3).attr('fill', 'var(--green)').text(D.me.team.length > 12 ? 'you' : D.me.team);
    svg.append('text').attr('class', 'ax').attr('x', width - m.r + 6).attr('y', yl + 3).text('league');
    const tip = el('div', 'tip'); tip.hidden = true; box.append(tip);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', width - m.l - m.r).attr('height', height - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', (ev) => { const [mx] = d3.pointer(ev); const w = Math.round(x.invert(mx)); const a = mine.find((d) => d.w === w), b = lg.find((d) => d.w === w); if (!a) return; tip.hidden = false; tip.replaceChildren(el('div', 'k', 'Week ' + w + (w > D.last ? ' · playoffs' : '')), el('div', 'pos-c', 'icemen ' + f1(a.v)), el('div', null, 'league avg ' + f1(b.v))); const r = box.getBoundingClientRect(); let lx = ev.clientX - r.left + 12; if (lx > r.width - 140) lx -= 150; tip.style.left = lx + 'px'; tip.style.top = Math.max(0, ev.clientY - r.top - 50) + 'px'; })
      .on('mouseleave', () => { tip.hidden = true; });
  }

  /* ================= what-if lab ================= */
  const saved = [];
  function drawLab() {
    const base = R.base, sc = live(), me = D.me.rid;
    if (base) { tween($('#lab-from'), base[me].playoff * 100, (v) => Math.round(v) + '%'); tween($('#lab-to'), (sc || base)[me].playoff * 100, (v) => Math.round(v) + '%'); const d = (sc || base)[me].playoff - base[me].playoff; const c = $('#lab-delta'); c.className = 'chip ' + (d > 0.005 ? 'up' : d < -0.005 ? 'down' : 'flat'); c.textContent = scenActive() ? spct(d) + ' pts' : 'no changes yet'; }
    const stats = $('#lab-stats'); stats.replaceChildren();
    if (base) {
      const s = sc || base, ids = myRoster();
      const poNow = clean(() => d3.mean(D.po, (w) => tot(myBase(), w, true))), poScen = d3.mean(D.po, (w) => tot(ids, w, true));
      const st = (label, a, b, fmt, note) => { const d = el('div', 'stat'); d.append(el('span', 'micro', label)); const v = el('span', 'v'); v.textContent = fmt(b); const dd = b - a; d.append(v, el('span', 'note ' + (dd > 0.0005 ? 'pos-c' : dd < -0.0005 ? 'neg-c' : 'dim'), (Math.abs(dd) < 0.0005 ? 'unchanged' : (dd > 0 ? '+' : '−') + fmt(Math.abs(dd)) + ' ' + note))); stats.append(d); };
      st('Expected wins', base[me].expW, s[me].expW, f1, 'wins');
      st('Division title', base[me].div, s[me].div, pct, '');
      st('Top-4 seed', d3.sum(base[me].seeds.slice(0, 4)), d3.sum(s[me].seeds.slice(0, 4)), pct, '');
      st('Playoff-week lineup', poNow, poScen, f1, 'pts/wk');
    }
    const pr = $('#lab-presets'); pr.replaceChildren();
    const find = (n) => myRoster().find((id) => D.P[id] && D.P[id].player === n);
    const presets = [];
    const ajb = find('A.J. Brown'); if (ajb) presets.push(['A.J. Brown back week ' + (D.cur + 1) + ' at 20 pts', () => { S.ov[ajb] = { ret: D.cur + 1, ppg: 20 }; }]);
    if (ajb) presets.push(['A.J. Brown out until week ' + (D.cur + 5), () => { S.ov[ajb] = { ret: D.cur + 5, ppg: null }; }]);
    const flex = ['TreVeyon Henderson', 'Malik Washington', 'Mark Andrews'].map(find).filter(Boolean);
    if (flex.length === 3) presets.push(['Always start Henderson, Washington, Andrews', () => { flex.forEach((id) => { S.pins.add(id); S.benches.delete(id); }); }]);
    const cmc = find('Christian McCaffrey'); if (cmc) presets.push(['McCaffrey misses 3 weeks', () => { S.ov[cmc] = { ret: D.cur + 4, ppg: null }; }]);
    if (presets.length) pr.append(el('span', 'micro', 'Try'));
    presets.forEach(([label, fn]) => { const b = el('button', 'btn quiet', label); b.type = 'button'; b.addEventListener('click', () => { fn(); drawLab(); recompute(); }); pr.append(b); });

    const tb = $('#lab-table tbody'); tb.replaceChildren();
    const ids = myBase().concat([...S.adds]);
    ids.map((id) => D.P[id]).filter(Boolean).sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || d3.sum(D.weeks, (w) => b['mu_w' + w] || 0) - d3.sum(D.weeks, (w) => a['mu_w' + w] || 0)).forEach((p) => {
      const o = S.ov[p.pid] || {}, dropped = S.drops.has(p.pid), added = S.adds.has(p.pid);
      const tr = el('tr', (added ? 'added' : '') + (dropped ? ' dropped' : ''));
      const nm = el('td'); nm.append(el('span', 'pname', p.player), el('span', 'dim', ' ' + p.pos));
      if (p.on_ir) nm.append(' ', el('span', 'pill mute', 'IR')); else if (p.injury) nm.append(' ', el('span', 'pill warn', p.injury));
      const sel = el('select'); sel.id = 'ret-' + p.pid; sel.setAttribute('aria-label', 'Out until for ' + p.player);
      sel.append(new Option('model', ''));
      for (let w = D.cur + 1; w <= D.maxWeek; w++) sel.append(new Option('week ' + w, String(w)));
      sel.value = o.ret ? String(o.ret) : '';
      sel.addEventListener('change', () => { setOv(p.pid, { ret: sel.value ? Number(sel.value) : null }); });
      const sc1 = el('td'); sc1.append(sel); sc1.className = 'keep';
      const inp = el('input'); inp.type = 'number'; inp.min = '0'; inp.max = '60'; inp.step = '0.5'; inp.id = 'ppg-' + p.pid; inp.placeholder = 'model'; inp.setAttribute('aria-label', 'Points per game for ' + p.player);
      if (o.ppg != null) inp.value = String(o.ppg);
      inp.addEventListener('change', () => { const v = inp.value === '' ? null : Math.max(0, Math.min(60, Number(inp.value))); setOv(p.pid, { ppg: isFinite(v) ? v : null }); });
      const sc2 = el('td', 'n keep'); sc2.append(inp);
      const avgW = D.weeks.filter((w) => w > D.cur && w <= D.last && hasGame(p, w));
      const mavg = avgW.length ? d3.mean(avgW, (w) => p['mu_w' + w] || 0) : 0;
      const dc = el('td', 'keep');
      if (added) { const b = el('button', 'tog', 'remove'); b.type = 'button'; b.addEventListener('click', () => { S.adds.delete(p.pid); delete S.ov[p.pid]; S.pins.delete(p.pid); drawLab(); recompute(); }); dc.append(b); }
      else { const cb = el('input'); cb.type = 'checkbox'; cb.id = 'drop-' + p.pid; cb.checked = dropped; cb.setAttribute('aria-label', 'Drop ' + p.player); cb.style.accentColor = 'var(--red)'; cb.addEventListener('change', () => { if (cb.checked) { S.drops.add(p.pid); S.pins.delete(p.pid); } else S.drops.delete(p.pid); drawLab(); recompute(); }); dc.append(cb); }
      tr.append(nm, sc1, sc2, el('td', 'n dim', f1(mavg)), dc);
      tb.append(tr);
    });
    drawSugg(); drawSaved();
  }
  function setOv(pid, patch) {
    const o = Object.assign({ ret: null, ppg: null }, S.ov[pid], patch);
    if (o.ret == null && o.ppg == null) delete S.ov[pid]; else S.ov[pid] = o;
    drawLab(); recompute();
  }
  function drawSugg() {
    const q = ($('#lab-search').value || '').trim().toLowerCase(), box = $('#lab-sugg'); box.replaceChildren();
    const ros = (p) => d3.sum(D.weeks.filter((w) => w > D.cur), (w) => p['mu_w' + w] || 0);
    const pool = rows('players').filter((p) => p.owner_rid === 0 && !S.adds.has(p.pid))
      .filter((p) => !q || (p.player + ' ' + (p.nfl || '') + ' ' + p.pos).toLowerCase().includes(q))
      .sort((a, b) => ros(b) - ros(a)).slice(0, q ? 12 : 8);
    if (!pool.length) { box.append(el('div', 'note', 'No free agent matches that search.')); return; }
    pool.forEach((p) => {
      const b = el('button'); b.type = 'button';
      b.append(el('span', 'dim', p.pos), el('span', null, p.player + ' · ' + (p.nfl || 'FA')), el('span', 'dim', f1(ros(p) / Math.max(1, D.maxWeek - D.cur)) + '/wk'));
      b.addEventListener('click', () => { S.adds.add(p.pid); $('#lab-search').value = ''; drawLab(); recompute(); });
      box.append(b);
    });
  }
  $('#lab-search').addEventListener('input', () => { if (D) drawSugg(); });
  $('#lab-runs').addEventListener('change', (e) => { S.runs = Number(e.target.value); });
  $('#lab-vol').addEventListener('input', (e) => { S.vol = Number(e.target.value); $('#lab-vol-v').textContent = f2(S.vol) + '×'; recompute(); });
  $('#lab-run').addEventListener('click', async () => {
    const btn = $('#lab-run'); btn.disabled = true; btn.textContent = 'Simulating…';
    const res = await simAsync(teamMeans(myRoster()), { runs: S.runs, vol: S.vol, seed: (Date.now() & 0xffff) + 7 }, (f) => { btn.textContent = 'Simulating ' + Math.round(f * 100) + '%'; });
    btn.disabled = false; btn.textContent = 'Run simulation';
    if (res) { R.scen = res; drawAll(); flash('#lab-results'); }
  });
  $('#lab-save').addEventListener('click', () => {
    const sc = live(); if (!sc) return;
    const name = ($('#lab-name').value || '').trim() || 'Scenario ' + (saved.length + 1);
    saved.push({ name, odds: sc[D.me.rid].playoff, expW: sc[D.me.rid].expW, po: d3.mean(D.po, (w) => tot(myRoster(), w, true)), state: JSON.stringify({ ov: S.ov, adds: [...S.adds], drops: [...S.drops], pins: [...S.pins], benches: [...S.benches], vol: S.vol }) });
    $('#lab-name').value = ''; drawSaved();
  });
  function drawSaved() {
    const tb = $('#lab-saved tbody'); tb.replaceChildren();
    if (!saved.length) { const tr = el('tr'), td = el('td', 'note', 'Nothing saved yet. Set up a what-if and save it to compare.'); td.colSpan = 5; tr.append(td); tb.append(tr); return; }
    const best = d3.max(saved, (s) => s.odds);
    saved.forEach((s, i) => {
      const tr = el('tr'), ld = el('button', 'tog', 'load'), rm = el('button', 'tog', '×'); ld.type = rm.type = 'button';
      ld.addEventListener('click', () => { const st = JSON.parse(s.state); S.ov = st.ov; S.adds = new Set(st.adds); S.drops = new Set(st.drops); S.pins = new Set(st.pins); S.benches = new Set(st.benches); S.vol = st.vol; $('#lab-vol').value = String(S.vol); $('#lab-vol-v').textContent = f2(S.vol) + '×'; drawAll(); recompute(); });
      rm.addEventListener('click', () => { saved.splice(i, 1); drawSaved(); });
      const td = el('td', 'n'); td.append(ld, ' ', rm);
      tr.append(el('td', 'pname', s.name), el('td', 'n' + (s.odds === best ? ' best' : ''), pct(s.odds)), el('td', 'n', f1(s.expW)), el('td', 'n hide-sm', f1(s.po)), td);
      tb.append(tr);
    });
  }

  /* ================= waivers (live) ================= */
  let wvCache = null, wvKey = '', posPick = 'all', winPick = 'reg', sortKey = 'gain';
  function waiverBoard() {
    const key = JSON.stringify([S.ov, [...S.adds], [...S.drops], [...S.pins], [...S.benches], winPick]);
    if (wvCache && wvKey === key) return wvCache;
    const ros = myRoster(), weeks = winPick === 'po' ? D.po : winPick === 'next' ? [D.cur + 1] : D.weeks.filter((w) => w <= D.last);
    const baseW = {}; weeks.forEach((w) => { baseW[w] = tot(ros, w, true); });
    const baseSum = d3.sum(weeks, (w) => baseW[w]);
    const droppable = ros.filter((id) => D.P[id] && !D.P[id].on_ir && !(D.P[id].played_this_week && weeks.includes(D.cur)));
    const cost = droppable.map((id) => [id, baseSum - d3.sum(weeks, (w) => tot(ros.filter((x) => x !== id), w, true))]).sort((a, b) => a[1] - b[1]).slice(0, 5);
    const faab = D.me.faab_left, list = [];
    rows('players').filter((p) => p.owner_rid === 0 && !S.adds.has(p.pid)).forEach((p) => {
      let best = null;
      cost.forEach(([d]) => {
        const r2 = ros.filter((x) => x !== d).concat([p.pid]);
        let g = 0, starts = 0;
        weeks.forEach((w) => { const L = lineup(r2, w, true); g += L.total - baseW[w]; if (L.slots.some((s) => s.p === p)) starts++; });
        if (!best || g > best.gain) best = { gain: g, starts, drop: D.P[d] };
      });
      if (best && best.gain > 0.3) {
        const hot = (p.adds_72h || 0) > 500000 ? 0.03 : 0;
        const scale = winPick === 'reg' ? 250 : winPick === 'po' ? 90 : 40;
        list.push({ p, gain: best.gain, starts: best.starts, drop: best.drop, bid: Math.round(faab * Math.min(0.25, best.gain / scale + hot)), next: val(p, D.cur + 1, true), ceil: range(p, D.cur + 1, true)[1], trend: p.adds_72h || 0, nweeks: weeks.length });
      }
    });
    list.sort((a, b) => b.gain - a.gain);
    wvKey = key; wvCache = { list, weeks };
    return wvCache;
  }
  function drawWaivers() {
    const wv = waiverBoard(), pos = POS_ORDER.filter((x) => wv.list.some((w) => w.p.pos === x));
    seg($('#pos-filter'), [['all', 'All']].concat(pos.map((p) => [p, p])), posPick, (v) => { posPick = v; });
    seg($('#win-filter'), [['reg', 'Rest of season'], ['next', 'Next week'], ['po', 'Playoff weeks']], winPick, (v) => { winPick = v; });
    const tb = $('#waiver-table tbody'); tb.replaceChildren();
    $$('#waiver-table th.sort').forEach((th) => { th.setAttribute('aria-sort', th.dataset.sort === sortKey ? 'descending' : 'none'); });
    const list = wv.list.filter((w) => posPick === 'all' || w.p.pos === posPick).slice().sort((a, b) => b[sortKey] - a[sortKey]).slice(0, 40);
    if (!list.length) { const tr = el('tr'), td = el('td', 'note', 'No free agent improves your lineup in this window.'); td.colSpan = 10; tr.append(td); tb.append(tr); return; }
    list.forEach((w) => {
      const p = w.p, tr = el('tr'), nm = el('td');
      nm.append(el('span', 'pname', p.player), el('span', 'dim', ' ' + (p.nfl || '')));
      if (p.injury) nm.append(' ', el('span', 'pill warn', p.injury));
      if (p.depth === 1) nm.append(' ', el('span', 'pill ok', 'starter'));
      const [gc, gl] = gradeOf(p['dvp_w' + (D.cur + 1)]); const mc = el('td', 'hide-sm'); const opp = p['opp_w' + (D.cur + 1)] || 'BYE';
      if (opp === 'BYE') mc.append(el('span', 'pill mute', 'bye')); else { const dot = el('span', 'grade ' + gc); mc.append(dot, el('span', null, opp + ' '), el('span', 'dim', gl.replace(' matchup', ''))); }
      const add = el('button', 'tog', 'try'); add.type = 'button'; add.title = 'Add him in the what-if lab';
      add.addEventListener('click', () => { S.adds.add(p.pid); S.drops.add(w.drop.pid); show('lab'); recompute(); });
      const tg = el('td', 'n pos-c', signed(w.gain));
      tr.append(nm, el('td', 'dim', p.pos), tg, el('td', 'n hide-sm', w.starts + '/' + w.nweeks), el('td', 'dim', w.drop.player), el('td', 'n', '$' + comma(w.bid)), el('td', 'n hide-sm', f1(w.next)), el('td', 'n hide-sm', f1(w.ceil)), mc, el('td', 'n hide-sm dim', w.trend ? d3.format('.2s')(w.trend) : ''));
      const td = el('td', 'n'); td.append(add); tr.append(td);
      tb.append(tr);
    });
  }
  $$('#waiver-table th.sort').forEach((th) => { th.tabIndex = 0; const go = () => { sortKey = th.dataset.sort; drawWaivers(); }; th.addEventListener('click', go); th.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }); });

  /* ================= trades ================= */
  let partner = null; const sendSet = new Set(), getSet = new Set();
  function drawTrades() {
    const others = D.T.filter((t) => !isMe(t)).sort((a, b) => a.team.localeCompare(b.team));
    if (partner == null) partner = others[0].rid;
    const sel = $('#ta-partner'); if (sel.options.length !== others.length) sel.replaceChildren(...others.map((t) => new Option(t.team, String(t.rid))));
    sel.value = String(partner);
    const w0 = D.cur + 1, w1 = D.last;
    const pick = (box, ids, set, prefix, mine) => {
      box.replaceChildren();
      ids.map((id) => D.P[id]).filter(Boolean).map((p) => [p, d3.sum(d3.range(w0, w1 + 1), (w) => val(p, w, mine))]).sort((a, b) => b[1] - a[1]).forEach(([p, v]) => {
        const lab = el('label', 'row'), cb = el('input'); cb.type = 'checkbox'; cb.id = prefix + p.pid; cb.checked = set.has(p.pid); cb.style.accentColor = 'var(--green)';
        cb.addEventListener('change', () => { if (cb.checked) set.add(p.pid); else set.delete(p.pid); evaluate(); });
        const nm = el('span'); nm.style.flex = '1'; nm.append(el('span', 'dim', p.pos + ' '), p.player); if (p.injury) nm.append(' ', el('span', 'pill warn', p.injury)); if (p.on_ir) nm.append(' ', el('span', 'pill mute', 'IR'));
        lab.append(cb, nm, el('span', 'dim', f1(v))); lab.style.borderBottom = '1px solid var(--rule-2)'; lab.style.padding = '3px 0';
        box.append(lab);
      });
    };
    pick($('#ta-mine'), myRoster(), sendSet, 'ta-m-', true);
    pick($('#ta-theirs'), rows('players').filter((p) => p.owner_rid === partner).map((p) => p.pid), getSet, 'ta-t-', false);
    $('#ta-theirs-label').textContent = 'You get from ' + D.byRid[partner].team;
    evaluate();
    const ib = $('#ideas-table tbody'); ib.replaceChildren();
    if (!D.me.is_me) { const tr = el('tr'), td = el('td', 'note', 'Deal ideas are worked out for the team you looked up (' + (D.T.find((x) => x.is_me) || D.me).team + '). For ' + D.me.team + ', build deals in the analyzer above; it scores any trade live.'); td.colSpan = 8; tr.append(td); ib.append(tr); return; }
    rows('trades').forEach((x) => {
      const tr = el('tr'), b = el('button', 'btn', 'Load'); b.type = 'button';
      b.addEventListener('click', () => { partner = x.partner_rid; sendSet.clear(); getSet.clear(); sendSet.add(x.give_pid); getSet.add(x.get_pid); drawTrades(); const ta = $('#ta'); if (ta.scrollIntoView) ta.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }); });
      const td = el('td'); td.append(b);
      tr.append(el('td', 'n dim', String(x.idea)), el('td', 'pname', x.give), el('td', 'pname', x.get), el('td', 'dim', x.partner), el('td', 'n pos-c', signed(x.my_gain)), el('td', 'n pos-c', signed(x.their_gain)), el('td', 'n hide-sm', String(x.starts_for_me)), td);
      ib.append(tr);
    });
  }
  $('#ta-partner').addEventListener('change', (e) => { partner = Number(e.target.value); getSet.clear(); drawTrades(); });
  $('#ta-clear').addEventListener('click', () => { sendSet.clear(); getSet.clear(); drawTrades(); });
  let taToken = 0;
  function evaluate() {
    const out = $('#ta-out'); out.replaceChildren();
    if (!sendSet.size && !getSet.size) { out.append(el('p', 'note', 'Tick players on both sides to score a deal, or load one of the ideas below.')); return; }
    const w0 = D.cur + 1, w1 = D.last, mine = myRoster();
    const myAfter = mine.filter((id) => !sendSet.has(id)).concat([...getSet]);
    const theirs = (w) => otherRoster(partner, w), theirsAfter = (w) => theirs(w).filter((id) => !getSet.has(id)).concat([...sendSet]);
    const sum = (f, a, b) => d3.sum(d3.range(a, b + 1), f);
    const myReg = sum((w) => tot(myAfter, w, true) - tot(mine, w, true), w0, w1);
    const thReg = sum((w) => tot(theirsAfter(w), w, false) - tot(theirs(w), w, false), w0, w1);
    const myPo = d3.sum(D.po, (w) => tot(myAfter, w, true) - tot(mine, w, true));
    const v = el('div', 'kpis');
    const cell = (label, big, cls, sub) => { const d = el('div', 'kpi'); d.append(el('span', 'micro', label)); const b = el('span', 'big ' + (cls || '')); b.textContent = big; d.append(b); if (sub) d.append(el('span', 'sub', sub)); v.append(d); return b; };
    cell('Your lineup, wks ' + w0 + '–' + w1, signed(myReg), myReg >= 0 ? 'pos-c' : 'neg-c', 'expected points');
    cell('Their lineup', signed(thReg), thReg >= 0 ? 'pos-c' : 'neg-c', 'expected points');
    cell('Your playoff weeks', signed(myPo), myPo >= 0 ? 'pos-c' : 'neg-c', 'weeks ' + D.po[0] + '–' + D.po[D.po.length - 1]);
    const oddsB = cell('Your playoff odds', '…', '', 'simulating');
    out.append(v);
    let msg = myReg > 1 && thReg > 0 ? 'Both lineups get better. Easy pitch.' : myReg > 1 ? 'Good for you, but their lineup drops ' + f1(-thReg) + '. Expect a counter.' : myReg < -1 && thReg > 0 ? 'Helps them more than you. Pass unless your playoff weeks jump.' : 'Close to neutral for your lineup.';
    const nS = sendSet.size, nG = getSet.size;
    if (nG > nS) msg += ' You take on ' + (nG - nS) + ' extra player' + (nG - nS > 1 ? 's' : '') + ', so plan a drop.';
    if (nS > nG) msg += ' Frees ' + (nS - nG) + ' roster spot' + (nS - nG > 1 ? 's' : '') + ' for a waiver add.';
    out.append(el('p', 'take', msg));
    const tok = ++taToken;
    setTimeout(() => {
      if (tok !== taToken) return;
      const ov = {}; ov[partner] = {}; for (let w = w0; w <= D.maxWeek; w++) ov[partner][w] = tot(theirsAfter(w), w, false);
      const before = simSync(teamMeans(mine), { runs: 6000, vol: S.vol }), mAfter = teamMeans(myAfter, ov); const after = simSync(mAfter, { runs: 6000, vol: S.vol });
      if (tok !== taToken) return;
      const b0 = before[D.me.rid].playoff, b1 = after[D.me.rid].playoff;
      oddsB.className = 'big ' + (b1 >= b0 ? 'pos-c' : 'neg-c'); tween(oddsB, b1 * 100, (x) => Math.round(x) + '%', 500);
      oddsB.nextSibling.textContent = 'from ' + pct(b0) + ' (' + spct(b1 - b0) + ')';
    }, 30);
  }

  /* ================= method ================= */
  function drawMethod() {
    const box = $('#mae-bars'); box.replaceChildren();
    const names = { mae_projection: 'Sleeper projection', mae_residual_gbm: 'Projection + GBM fix', mae_shrink_to_avg: 'Shrink to season avg', mae_gbm: 'Gradient boosting' };
    const ms = rows('model').filter((m) => m.metric.startsWith('mae_')).sort((a, b) => a.value - b.value), mx = d3.max(ms, (m) => m.value) || 1;
    ms.forEach((m, k) => { const r = el('div', 'oddcell'); r.style.gridTemplateColumns = '10.5em 1fr 3em'; const b = el('div', 'bar' + (k ? ' gold' : '')), i = el('i'); b.append(i); r.append(el('span', null, names[m.metric] || m.metric), b, el('span', 'n', f2(m.value))); box.append(r); requestAnimationFrame(() => { i.style.width = (100 * m.value / mx) + '%'; }); });
    const tb = $('#model-table tbody'); tb.replaceChildren();
    rows('model').forEach((m) => { const tr = el('tr'); tr.append(el('td', 'dim', m.metric), el('td', 'n', String(m.value))); tb.append(tr); });
  }

  /* ================= team switcher ================= */
  function findTeam(q) {
    q = String(q || '').trim().toLowerCase().replace(/^@/, '');
    if (!q || !D) return null;
    return D.T.find((t) => String(t.manager).toLowerCase() === q) || D.T.find((t) => t.team.toLowerCase() === q) || null;
  }
  function switchTeam(t, quiet) {
    if (!t || !D) return;
    chosenRid = t.rid; D.me = t;
    S.ov = {}; S.adds.clear(); S.drops.clear(); S.pins.clear(); S.benches.clear();
    Object.keys(picks).forEach((k) => delete picks[k]);
    saved.length = 0; partner = null; sendSet.clear(); getSet.clear(); openTeam = null;
    otherBase = null; wvCache = null; R.base = null; R.scen = null; R.mach = null;
    const inp = $('#who-input'); if (inp && document.activeElement !== inp) inp.value = t.manager;
    $('#who-msg').textContent = t.is_me ? '' : 'Viewing ' + t.team + ' (' + t.manager + ') in ' + (D.leagueName || 'this league') + '. What-ifs and picks reset for this team.';
    drawAll(); if (!quiet) flash('#headline');
    simAsync(clean(() => teamMeans(myBase())), { runs: 20000, vol: 1 }, null, 'base').then((res) => { if (!res || D.me !== t) return; R.base = res; R.scen = res; drawAll(); });
  }
  function drawWho() {
    const dl = $('#who-list'); if (!dl) return; dl.replaceChildren();
    D.T.slice().sort((a, b) => a.manager.localeCompare(b.manager)).forEach((t) => { const o = document.createElement('option'); o.value = t.manager; o.label = t.team; dl.append(o); });
  }
  const goWho = () => {
    const v = $('#who-input').value, t = findTeam(v);
    if (t) switchTeam(t);
    else if (v.trim() && window.WR_SHELL) window.WR_SHELL.pull(v.trim());
  };
  $('#who-go').addEventListener('click', goWho);
  $('#who-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); goWho(); } });

  /* ================= orchestration ================= */
  function drawPane() {
    if (!D) return;
    if (pane === 'race') drawRace();
    if (pane === 'machine') drawMachine();
    if (pane === 'lineup') drawLineup();
    if (pane === 'lab') drawLab();
    if (pane === 'waivers') drawWaivers();
    if (pane === 'trades') drawTrades();
    if (pane === 'method') drawMethod();
  }
  function drawAll() { if (!D) return; drawHeader(); drawPane(); moveInk(); }

  dash.onData(() => {
    const s = ['teams', 'players', 'schedule', 'history', 'model', 'trades', 'allplay'].map((id) => dash.data(id).status + (dash.data(id).refreshing ? 'r' : '') + (dash.data(id).v || '')).join();
    if (s !== sig) {
      sig = s; const nd = build();
      if (nd && D && nd.leagueId !== D.leagueId) { chosenRid = null; S.ov = {}; S.adds.clear(); S.drops.clear(); S.pins.clear(); S.benches.clear(); Object.keys(picks).forEach((k) => delete picks[k]); saved.length = 0; partner = null; sendSet.clear(); getSet.clear(); openTeam = null; machWeek = null; luWeek = null; }
      if (nd && D && nd.leagueId === D.leagueId && nd.T !== D.T && chosenRid != null && !nd.T.some((t) => t.rid === chosenRid)) chosenRid = null;
      if (nd && (!D || nd.T !== D.T)) {
        D = nd; otherBase = null; wvCache = null; R.base = null; R.scen = null; R.mach = null;
        drawWho();
        if (chosenRid == null) {
          /* the shell already picked the team by Sleeper username */
          const inp = $('#who-input'); if (inp) inp.value = D.me.manager;
        }
        drawAll();
        simAsync(clean(() => teamMeans(myBase())), { runs: 20000, vol: 1 }, null, 'base').then((res) => {
          if (!res) return;
          R.base = res; if (!scenActive()) R.scen = res; drawAll(); if (scenActive()) recompute();
        });
        return;
      }
    }
    if (D) drawAll();
    else {
      ['#kpi-odds', '#kpi-wins'].forEach((s) => { const n = $(s); if (n) n.textContent = '—'; });
    }
  });
  const named = location.hash.slice(1);
  if (panes.includes(named)) setTimeout(() => show(named), 0);
  window.addEventListener('resize', () => { moveInk(); });
})();
