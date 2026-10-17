/* War room live data layer.
   Pulls a league straight from Sleeper's public API in the viewer's browser (no server, no Claude),
   scores players with the league's own settings, calibrates floors/ceilings and matchup grades on the
   season so far, simulates the rest of the season, and exposes the result through the small `dash`
   interface the page code reads (data, calc, onData, setLink). */
window.WR = (function () {
  'use strict';
  const API = 'https://api.sleeper.app';
  const OFF = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'], IDP = ['DL', 'LB', 'DB'];
  const ELIG = {
    QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'], DL: ['DL'], LB: ['LB'], DB: ['DB'],
    FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'], WRRB_FLEX: ['RB', 'WR'],
    IDP_FLEX: ['DL', 'LB', 'DB'],
  };
  const FALLBACK_Q = { QB: [0.69, 1.46], RB: [0.39, 1.42], WR: [0.38, 1.64], TE: [0.27, 1.58], K: [0.59, 1.69], DEF: [0.3, 1.8], DL: [0.4, 1.6], LB: [0.5, 1.5], DB: [0.4, 1.6] };
  const FALLBACK_SD = { QB: 7.9, RB: 6.2, WR: 6.6, TE: 6.4, K: 5.5, DEF: 6.5, DL: 5, LB: 5, DB: 5 };
  const INJ = { Out: 0, IR: 0, PUP: 0, Sus: 0, Suspended: 0, NA: 0, Doubtful: 0.3, Questionable: 0.85 };
  const SIM_RUNS = 20000;

  /* ---------- dash interface ---------- */
  const IDS = ['teams', 'players', 'schedule', 'history', 'waivers', 'trades', 'model'];
  let store = {}, cache = {};
  const calcs = {}, subs = [];
  const setAll = (status, extra) => { IDS.forEach((k) => { store[k] = Object.assign({ status, data: [] }, extra || {}); }); cache = {}; };
  setAll('loading');
  const notify = () => { cache = {}; subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); };
  function data(id) {
    if (store[id]) return store[id];
    const c = calcs[id];
    if (!c) return { status: 'missing', data: [] };
    if (cache[id]) return cache[id];
    const ins = c.inputs.map(data), bad = ins.find((x) => x.status !== 'ok');
    if (bad) return { status: bad.status, data: [] };
    let out;
    try { out = { status: 'ok', data: c.fn.apply(null, ins.map((x) => x.data)) }; } catch (e) { out = { status: 'error', data: [], message: String(e) }; }
    cache[id] = out; return out;
  }
  window.dash = {
    data,
    calc: (id, o) => { calcs[id] = o; },
    onData: (fn) => { subs.push(fn); fn(); },
    setLink: (name) => { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } },
  };
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(notify, 250); });

  /* ---------- small helpers ---------- */
  const store_ = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } } };
  const q = (arr, p) => { if (!arr.length) return NaN; const a = arr.slice().sort((x, y) => x - y); const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  const sd = (a) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); };
  const r2 = (x) => Math.round(x * 100) / 100;
  let progress = { done: 0, total: 1, label: '' }, onProgress = null;
  async function get(path, label) {
    const res = await fetch(API + path, { cache: 'no-store' });
    progress.done++; if (onProgress) onProgress(progress, label);
    if (!res.ok) throw new Error('Sleeper returned ' + res.status + ' for ' + path);
    return res.json();
  }

  /* ---------- scoring with the league's settings ---------- */
  function scorer(sc) {
    const rec = sc.rec == null ? 1 : sc.rec;
    const base = rec >= 0.75 ? 'pts_ppr' : rec >= 0.25 ? 'pts_half_ppr' : 'pts_std';
    const passTd = (sc.pass_td == null ? 4 : sc.pass_td) - 4;
    const bonus = ['bonus_rec_te', 'bonus_rec_wr', 'bonus_rec_rb'].filter((k) => sc[k]).map((k) => [k, sc[k]]);
    return (st) => {
      if (!st) return 0;
      let v = st[base] != null ? st[base] : (st.pts_ppr || 0);
      if (passTd && st.pass_td) v += passTd * st.pass_td;
      bonus.forEach(([k, w]) => { if (st[k]) v += w * st[k]; });
      return v;
    };
  }

  /* ---------- lineup (same greedy as the page) ---------- */
  function slotOrder(slots) {
    const fixed = slots.filter((s) => ELIG[s] && ELIG[s].length === 1);
    const flex = slots.filter((s) => ELIG[s] && ELIG[s].length > 1).sort((a, b) => ELIG[a].length - ELIG[b].length);
    return fixed.concat(flex);
  }
  function bestSet(players, w, slots, val) {
    const used = new Set(); let tot = 0;
    const cand = players.slice().sort((a, b) => val(b, w) - val(a, w));
    slotOrder(slots).forEach((s) => { const p = cand.find((x) => !used.has(x.pid) && ELIG[s].includes(x.pos)); if (p) { used.add(p.pid); tot += val(p, w); } });
    return { tot, used };
  }
  const bestTotal = (players, w, slots, val) => bestSet(players, w, slots, val).tot;

  /* ---------- season simulation ---------- */
  function simulate(teams, games, means, sdTeam, P, nDiv, cur) {
    const K = teams.length, idx = {}; teams.forEach((t, i) => { idx[t.rid] = i; });
    const G = games.map((g) => ({ a: idx[g.team_a], b: idx[g.team_b], ma: means[g.team_a][g.week] || 0, mb: means[g.team_b][g.week] || 0, s: sdTeam * (g.week === cur ? 0.85 : 1) }));
    const divs = nDiv ? [...new Set(teams.map((t) => t.div_id))] : [];
    const W0 = teams.map((t) => t.wins), PF0 = teams.map((t) => t.pf), divOf = teams.map((t) => t.div_id);
    let a = 20261016; const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let spare = null; const gauss = () => { if (spare != null) { const s = spare; spare = null; return s; } let u = 0; while (!u) u = rnd(); const v = rnd(), m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); };
    const made = new Float64Array(K), div = new Float64Array(K), wins = new Float64Array(K), seeds = teams.map(() => new Float64Array(P));
    const winDist = teams.map(() => []);
    const Wv = new Float64Array(K), PF = new Float64Array(K), key = new Float64Array(K);
    for (let n = 0; n < SIM_RUNS; n++) {
      for (let i = 0; i < K; i++) { Wv[i] = W0[i]; PF[i] = PF0[i]; }
      for (const g of G) { const x = g.ma + g.s * gauss(), y = g.mb + g.s * gauss(); PF[g.a] += x; PF[g.b] += y; if (x > y) Wv[g.a]++; else Wv[g.b]++; }
      for (let i = 0; i < K; i++) { key[i] = Wv[i] * 10000 + PF[i]; wins[i] += Wv[i]; if (n % 10 === 0) winDist[i].push(Wv[i]); }
      const winners = divs.map((d) => { let b = -1; for (let i = 0; i < K; i++) if (divOf[i] === d && (b < 0 || key[i] > key[b])) b = i; return b; }).filter((i) => i >= 0);
      winners.sort((x, y) => key[y] - key[x]);
      const rest = []; for (let i = 0; i < K; i++) if (!winners.includes(i)) rest.push(i);
      rest.sort((x, y) => key[y] - key[x]);
      winners.concat(rest.slice(0, Math.max(0, P - winners.length))).forEach((i, s) => { made[i]++; seeds[i][s]++; });
      winners.forEach((i) => { div[i]++; });
    }
    const out = {};
    teams.forEach((t, i) => { out[t.rid] = { playoff: made[i] / SIM_RUNS, div: div[i] / SIM_RUNS, expW: wins[i] / SIM_RUNS, seeds: Array.from(seeds[i]).map((x) => x / SIM_RUNS), p10: q(winDist[i], 0.1), p90: q(winDist[i], 0.9) }; });
    return out;
  }

  /* ---------- the pull ---------- */
  let current = null, busy = false, version = 0;
  async function load(username, leagueId, cb) {
    if (busy) return; busy = true; onProgress = cb || null;
    progress = { done: 0, total: 6, label: '' };
    const hadData = store.teams && store.teams.status === 'ok';
    try {
      const state = await get('/v1/state/nfl', 'NFL calendar');
      const season = state.league_season || state.season;
      const user = await get('/v1/user/' + encodeURIComponent(username), 'your Sleeper account');
      if (!user || !user.user_id) throw Object.assign(new Error('No Sleeper account named “' + username + '”.'), { kind: 'nouser' });
      const leagues = (await get('/v1/user/' + user.user_id + '/leagues/nfl/' + season, 'your leagues')) || [];
      if (!leagues.length) throw Object.assign(new Error(user.display_name + ' isn’t in any ' + season + ' Sleeper leagues.'), { kind: 'noleague' });
      const league = leagues.find((l) => l.league_id === leagueId) || leagues.find((l) => l.status === 'in_season') || leagues[0];
      if (!hadData) { setAll('loading'); notify(); }
      const S = league.settings || {}, sc = league.scoring_settings || {};
      const curRaw = Number(state.season_type === 'regular' ? state.week : state.season_type === 'pre' ? 1 : (S.playoff_week_start || 15));
      const lastReg = (S.playoff_week_start || 15) - 1;
      const cur = Math.max(1, Math.min(curRaw, 18));
      const P = S.playoff_teams || 6;
      const rounds = Math.ceil(Math.log2(Math.max(2, P)));
      const poWeeks = []; for (let w = lastReg + 1; w <= Math.min(18, lastReg + rounds); w++) poWeeks.push(w);
      const maxWeek = Math.max(cur, poWeeks.length ? poWeeks[poWeeks.length - 1] : 17);
      const slots = (league.roster_positions || []).filter((s) => ELIG[s]);
      const usesIDP = slots.some((s) => ['DL', 'LB', 'DB', 'IDP_FLEX'].includes(s));
      const POS = usesIDP ? OFF.concat(IDP) : OFF;
      const posQuery = POS.map((p) => 'position[]=' + p).join('&');
      const calWeeks = []; for (let w = Math.max(1, cur - 4); w < cur; w++) calWeeks.push(w);
      const projWeeks = []; for (let w = cur; w <= maxWeek; w++) projWeeks.push(w);
      const matchWeeks = []; for (let w = 1; w <= Math.max(lastReg, cur); w++) matchWeeks.push(w);
      const statWeeks = []; for (let w = 1; w <= cur; w++) statWeeks.push(w);
      progress.total = progress.done + 4 + matchWeeks.length + statWeeks.length + calWeeks.length + projWeeks.length;
      const L = league.league_id;
      const [rosters, users, sched, trend, ...rest] = await Promise.all([
        get('/v1/league/' + L + '/rosters', 'rosters'), get('/v1/league/' + L + '/users', 'managers'),
        get('/schedule/nfl/regular/' + season, 'NFL schedule'), get('/v1/players/nfl/trending/add?lookback_hours=72&limit=50', 'trending adds').catch(() => []),
        ...matchWeeks.map((w) => get('/v1/league/' + L + '/matchups/' + w, 'week ' + w + ' matchups')),
        ...statWeeks.map((w) => get('/v1/stats/nfl/regular/' + season + '/' + w, 'week ' + w + ' stats')),
        ...calWeeks.concat(projWeeks).map((w) => get('/projections/nfl/' + season + '/' + w + '?season_type=regular&' + posQuery, 'week ' + w + ' projections')),
      ]);
      const mups = {}, stats = {}, proj = {};
      matchWeeks.forEach((w, i) => { mups[w] = rest[i] || []; });
      statWeeks.forEach((w, i) => { stats[w] = rest[matchWeeks.length + i] || {}; });
      calWeeks.concat(projWeeks).forEach((w, i) => { const m = {}; (rest[matchWeeks.length + statWeeks.length + i] || []).forEach((r) => { m[r.player_id] = r; }); proj[w] = m; });
      const pts = scorer(sc);

      /* player info from projections */
      const info = {};
      Object.keys(proj).sort((a, b) => b - a).forEach((w) => Object.values(proj[w]).forEach((r) => {
        if (info[r.player_id] || !r.player) return;
        const pl = r.player, pos = pl.position;
        info[r.player_id] = { name: pos === 'DEF' ? r.player_id + ' D/ST' : ((pl.first_name || '') + ' ' + (pl.last_name || '')).trim() || r.player_id, pos, team: pl.team || r.team || null, inj: pl.injury_status || null, body: pl.injury_body_part || null };
      }));
      const nameOf = (pid) => (info[pid] ? info[pid] : { name: /^[A-Z]{2,3}$/.test(pid) ? pid + ' D/ST' : 'Player ' + pid, pos: /^[A-Z]{2,3}$/.test(pid) ? 'DEF' : null, team: /^[A-Z]{2,3}$/.test(pid) ? pid : null, inj: null, body: null });

      /* NFL opponents per week from the schedule */
      const oppOf = {};
      (sched || []).forEach((g) => { (oppOf[g.week] = oppOf[g.week] || {})[g.home] = g.away; oppOf[g.week][g.away] = g.home; });
      const opp = (team, w) => (team && oppOf[w] ? oppOf[w][team] || null : null);
      const actual = (w, pid) => { const s = stats[w] && stats[w][pid]; return s && s.gms_active ? pts(s) : null; };
      const projPts = (w, pid) => { const r = proj[w] && proj[w][pid]; return r ? pts(r.stats) : null; };

      /* calibrate floors/ceilings, residual spread and projection error on completed weeks */
      const ratios = {}, resid = {}, misses = [];
      calWeeks.forEach((w) => Object.keys(proj[w]).forEach((pid) => {
        const pos = nameOf(pid).pos, pr = projPts(w, pid), y = actual(w, pid);
        if (!pos || pr == null || y == null) return;
        if (pr > 0.5) { (resid[pos] = resid[pos] || []).push(y - pr); misses.push(Math.abs(y - pr)); }
        if (pr > 3) (ratios[pos] = ratios[pos] || []).push({ w, r: y / pr });
      }));
      const RQ = {}, fitQ = (arr) => [q(arr, 0.2), q(arr, 0.8)];
      POS.forEach((pos) => { const a = (ratios[pos] || []).map((x) => x.r); RQ[pos] = a.length >= 25 ? fitQ(a) : FALLBACK_Q[pos]; });
      let coverage = null;
      if (calWeeks.length >= 2) {
        const lastW = calWeeks[calWeeks.length - 1]; let hit = 0, n = 0;
        POS.forEach((pos) => {
          const tr = (ratios[pos] || []).filter((x) => x.w !== lastW).map((x) => x.r), te = (ratios[pos] || []).filter((x) => x.w === lastW).map((x) => x.r);
          if (tr.length < 25) return; const [lo, hi] = fitQ(tr); te.forEach((r) => { n++; if (r >= lo && r <= hi) hit++; });
        });
        coverage = n ? hit / n : null;
      }
      const SDP = {}; POS.forEach((pos) => { const s = sd(resid[pos] || []); SDP[pos] = isFinite(s) && (resid[pos] || []).length >= 25 ? s : FALLBACK_SD[pos]; });
      const teamSd = Math.sqrt(slots.reduce((s, sl) => { const ps = ELIG[sl]; const v = ps.length === 1 ? SDP[ps[0]] : SDP.WR || 6.6; return s + v * v; }, 0)) || 20;

      /* matchup grades: points each defense allows by position, vs league average */
      const allowed = {};
      for (let w = 1; w < cur; w++) {
        const by = {};
        Object.keys(stats[w] || {}).forEach((pid) => {
          const ni = nameOf(pid), y = actual(w, pid), o = opp(ni.team, w);
          if (y == null || !ni.pos || !o) return;
          const k = o + '|' + ni.pos; by[k] = (by[k] || 0) + y;
        });
        Object.entries(by).forEach(([k, v]) => { (allowed[k] = allowed[k] || []).push(v); });
      }
      const posAvg = {}; POS.forEach((pos) => { const vals = Object.entries(allowed).filter(([k]) => k.endsWith('|' + pos)).map(([, v]) => mean(v)); posAvg[pos] = mean(vals); });
      const dvp = (def, pos) => { const a = allowed[def + '|' + pos]; return a && posAvg[pos] ? r2(mean(a) / posAvg[pos]) : null; };

      /* who's who */
      const userBy = {}; (users || []).forEach((u) => { userBy[u.user_id] = u; });
      const rosterOf = {}; (rosters || []).forEach((r) => { (r.players || []).forEach((p) => { rosterOf[p] = { rid: r.roster_id, ir: (r.reserve || []).includes(p) }; }); });
      const myRoster = (rosters || []).find((r) => r.owner_id === user.user_id || (r.co_owners || []).includes(user.user_id));
      const playedNow = new Set(Object.keys(stats[cur] || {}).filter((pid) => stats[cur][pid] && stats[cur][pid].gms_active));
      const weeksAll = []; for (let w = cur; w <= maxWeek; w++) weeksAll.push(w);

      /* expected points per player-week (same rules as the offline model) */
      const mu = (pid, w) => {
        if (w === cur && playedNow.has(pid)) return actual(cur, pid) || 0;
        const pr = projPts(w, pid); if (pr == null) return 0;
        const ni = nameOf(pid), onIR = rosterOf[pid] && rosterOf[pid].ir;
        if (w === cur) return Math.max(0, pr * (INJ[ni.inj] != null ? INJ[ni.inj] : 1));
        if ((ni.inj === 'IR' || onIR) && w < cur + 4) return 0;
        return Math.max(0, pr);
      };
      const rostered = Object.keys(rosterOf);
      const nextW = Math.min(cur + 1, maxWeek);
      const ros = (pid) => weeksAll.reduce((s, w) => s + mu(pid, w), 0);
      const CAP = { QB: 14, RB: 40, WR: 50, TE: 22, K: 10, DEF: 12, DL: 12, LB: 12, DB: 12 }, cnt = {};
      const pool = Object.keys(proj[nextW] || proj[cur] || {}).filter((pid) => !rosterOf[pid] && nameOf(pid).team && POS.includes(nameOf(pid).pos))
        .map((pid) => [pid, ros(pid)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
        .filter(([pid]) => { const pos = nameOf(pid).pos; cnt[pos] = (cnt[pos] || 0) + 1; return cnt[pos] <= (CAP[pos] || 10); }).map(([pid]) => pid);
      const trendBy = {}; (trend || []).forEach((t) => { trendBy[t.player_id] = t.count; });

      const players = rostered.concat(pool).map((pid) => {
        const ni = nameOf(pid), ro = rosterOf[pid] || { rid: 0, ir: false };
        const past = []; for (let w = 1; w <= cur; w++) past.push(actual(w, pid));
        const played = past.slice(0, cur - 1).filter((x) => x != null);
        const row = { pid, player: ni.name, pos: ni.pos || 'NA', nfl: ni.team, owner_rid: ro.rid, on_ir: ro.ir, injury: ni.inj || '', body: ni.body || '', depth: null, season_avg: played.length ? r2(mean(played)) : null, snap_share: null, adds_72h: trendBy[pid] || 0, played_this_week: playedNow.has(pid) };
        past.forEach((v, i) => { row['pts_w' + (i + 1)] = v == null ? null : r2(v); });
        const rq = RQ[ni.pos] || [0.5, 1.5];
        weeksAll.forEach((w) => {
          const m = mu(pid, w), o = opp(ni.team, w);
          row['mu_w' + w] = r2(m);
          row['lo_w' + w] = w === cur && row.played_this_week ? r2(m) : r2(m * rq[0]);
          row['hi_w' + w] = w === cur && row.played_this_week ? r2(m) : r2(m * rq[1]);
          row['opp_w' + w] = o || 'BYE';
          row['dvp_w' + w] = o ? dvp(o, ni.pos) : null;
        });
        return row;
      }).filter((p) => p.pos !== 'NA');
      const PB = {}; players.forEach((p) => { PB[p.pid] = p; });
      const val = (p, w) => p['mu_w' + w] || 0;
      const avail = (rid, w) => players.filter((p) => p.owner_rid === rid && (!p.on_ir || w >= cur + 4));

      /* league schedule and results */
      const games = [], history = [];
      matchWeeks.forEach((w) => {
        const by = {}; (mups[w] || []).forEach((m) => { if (m.matchup_id != null) (by[m.matchup_id] = by[m.matchup_id] || []).push(m); });
        Object.values(by).forEach((g) => {
          if (g.length !== 2) return;
          if (w >= cur && w <= lastReg) games.push({ game: 'w' + w + '-' + g[0].roster_id + '-' + g[1].roster_id, week: w, team_a: g[0].roster_id, team_b: g[1].roster_id });
          if (w <= cur) [[g[0], g[1]], [g[1], g[0]]].forEach(([a, b]) => history.push({ key: 'w' + w + '-' + a.roster_id, week: w, rid: a.roster_id, opp: b.roster_id, pts: a.points || 0, opp_pts: b.points || 0, final: w < cur }));
        });
      });

      /* teams */
      const divNames = league.metadata || {};
      const nDiv = S.divisions || 0;
      const curMup = {}; (mups[cur] || []).forEach((m) => { curMup[m.roster_id] = m; });
      const teams = (rosters || []).map((r) => {
        const u = userBy[r.owner_id] || {}, st = r.settings || {};
        const name = (u.metadata && u.metadata.team_name) || ('Team ' + (u.display_name || r.roster_id));
        const starters = (curMup[r.roster_id] && curMup[r.roster_id].starters) || r.starters || [];
        const t = { rid: r.roster_id, team: name, manager: u.display_name || ('roster ' + r.roster_id), division: nDiv ? (divNames['division_' + st.division] || ('Division ' + st.division)) : 'League', div_id: nDiv ? (st.division || 1) : r.roster_id,
          wins: st.wins || 0, losses: st.losses || 0, pf: r2((st.fpts || 0) + (st.fpts_decimal || 0) / 100), pa: r2((st.fpts_against || 0) + (st.fpts_against_decimal || 0) / 100),
          faab_left: (S.waiver_budget || 0) - (st.waiver_budget_used || 0), is_me: !!(myRoster && myRoster.roster_id === r.roster_id), starters: starters.join(','), live_pts: (curMup[r.roster_id] && curMup[r.roster_id].points) || 0 };
        weeksAll.forEach((w) => { t['exp_w' + w] = r2(w === cur ? starters.reduce((s, pid) => s + (PB[pid] ? val(PB[pid], cur) : 0), 0) : bestTotal(avail(r.roster_id, w), w, slots, val)); });
        return t;
      });
      if (!teams.some((t) => t.is_me) && teams.length) teams[0].is_me = true;
      const means = {}; teams.forEach((t) => { means[t.rid] = {}; weeksAll.forEach((w) => { means[t.rid][w] = t['exp_w' + w]; }); });
      const res = simulate(teams, games, means, teamSd, Math.min(P, teams.length), nDiv, cur);
      teams.forEach((t) => {
        const o = res[t.rid];
        Object.assign(t, { playoff_pct: r2(o.playoff * 100) / 100, div_win_pct: nDiv ? Math.round(o.div * 1e4) / 1e4 : 0, exp_wins: r2(o.expW), wins_p10: o.p10, wins_p90: o.p90, status: 'Alive' });
        o.seeds.forEach((v, i) => { t['seed' + (i + 1) + '_pct'] = Math.round(v * 1e4) / 1e4; });
        t.playoff_pct = Math.round(o.playoff * 1e4) / 1e4;
      });

      /* win-win 1-for-1 trade ideas for the chosen team */
      const meT = teams.find((t) => t.is_me), trades = [];
      if (meT && cur < lastReg) {
        const span = (list) => { let s = 0; for (let w = cur + 1; w <= lastReg; w++) s += bestTotal(list.filter((p) => !p.on_ir || w >= cur + 4), w, slots, val); return s; };
        const mine = players.filter((p) => p.owner_rid === meT.rid), myBase = span(mine);
        teams.filter((t) => t.rid !== meT.rid).forEach((t) => {
          const theirs = players.filter((p) => p.owner_rid === t.rid), thBase = span(theirs);
          mine.forEach((a) => {
            if (a.pos === 'DEF' || a.pos === 'K') return;
            theirs.forEach((b) => {
              if (b.pos === 'DEF' || b.pos === 'K') return;
              const dm = span(mine.filter((x) => x !== a).concat([b])) - myBase; if (dm <= 2) return;
              const dt = span(theirs.filter((x) => x !== b).concat([a])) - thBase; if (dt <= 0) return;
              const after = mine.filter((x) => x !== a).concat([b]); let st = 0;
              for (let w = cur + 1; w <= lastReg; w++) if (bestSet(after.filter((p) => !p.on_ir || w >= cur + 4), w, slots, val).used.has(b.pid)) st++;
              if (st >= Math.min(4, lastReg - cur)) trades.push({ give_pid: a.pid, give: a.player, get_pid: b.pid, get: b.player, partner_rid: t.rid, partner: t.team, my_gain: r2(dm), their_gain: r2(dt), starts_for_me: st });
            });
          });
        });
        trades.sort((x, y) => Math.min(y.my_gain, y.their_gain) - Math.min(x.my_gain, x.their_gain));
      }
      const seen = new Set(), ideas = [];
      trades.forEach((x) => { if (ideas.length < 8 && !seen.has(x.get_pid)) { seen.add(x.get_pid); ideas.push(Object.assign({ idea: ideas.length + 1 }, x)); } });

      const asOf = new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const model = [
        ['method', 'projection'], ['mae_projection', misses.length ? r2(mean(misses)) : null], ['band_coverage_20_80', coverage == null ? null : r2(coverage)],
        ['team_weekly_sd', r2(teamSd)], ['sim_runs', SIM_RUNS], ['current_week', cur], ['last_regular_week', lastReg], ['data_as_of', asOf],
        ['league_id', league.league_id], ['league_name', league.name], ['playoff_teams', Math.min(P, teams.length)], ['divisions', nDiv],
        ['waiver_budget', S.waiver_budget || 0], ['slots', JSON.stringify(slots)], ['playoff_weeks', JSON.stringify(poWeeks)], ['max_week', maxWeek],
        ['scoring', (sc.rec == null ? 1 : sc.rec) + ' per catch'], ['username', user.display_name], ['calibration_weeks', calWeeks.join(',')],
      ].map(([metric, value]) => ({ metric, value }));

      current = { username: user.display_name, leagueId: league.league_id, leagues: leagues.map((l) => ({ id: l.league_id, name: l.name, season: l.season, status: l.status })) };
      store_.set('wr-user', user.display_name); store_.set('wr-league', league.league_id);
      version++;
      const ok = (d) => ({ status: 'ok', data: d, v: version });
      store = { teams: ok(teams), players: ok(players), schedule: ok(games), history: ok(history), waivers: ok([]), trades: ok(ideas), model: ok(model) };
      busy = false; notify();
      document.dispatchEvent(new CustomEvent('wr-loaded', { detail: current }));
      return current;
    } catch (e) {
      busy = false;
      if (!hadData && e.kind !== 'nouser' && e.kind !== 'noleague') { setAll('error', { message: e.message }); notify(); }
      document.dispatchEvent(new CustomEvent('wr-error', { detail: { message: e.message || String(e), kind: e.kind || 'network' } }));
      throw e;
    }
  }
  return { load, get current() { return current; }, get busy() { return busy; }, lastUser: () => store_.get('wr-user'), lastLeague: () => store_.get('wr-league') };
})();
