/* Page shell: username and league pickers, the Refresh button, pull progress, and league-format notes. */
window.WR_SHELL = (function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PANES = ['race', 'machine', 'lineup', 'lab', 'waivers', 'trades', 'method'];
  const say = (text, tone) => { const s = $('rf-status'); s.textContent = text || ''; s.className = 'note rf-status' + (tone ? ' ' + tone : ''); };
  let lastName = null;

  function pull(username, leagueId) {
    if (!username || window.WR.busy) return;
    lastName = username;
    const btn = $('rf-btn'), bar = $('rf-bar'), fill = bar.firstElementChild;
    btn.disabled = true; bar.hidden = false; fill.style.width = '3%';
    document.getElementById('wr').classList.add('refreshing');
    say('Contacting Sleeper…');
    return window.WR.load(username, leagueId, (p, label) => {
      fill.style.width = Math.max(3, Math.round((p.done / Math.max(1, p.total)) * 100)) + '%';
      say('Pulling ' + label + ' from Sleeper · ' + p.done + ' of ' + p.total);
    }).then((cur) => {
      fill.style.width = '100%';
      setTimeout(() => { bar.hidden = true; fill.style.width = '0'; }, 500);
      btn.disabled = false; document.getElementById('wr').classList.remove('refreshing');
      say('');
      drawLeagues(cur);
      return cur;
    }).catch((e) => {
      bar.hidden = true; btn.disabled = false; document.getElementById('wr').classList.remove('refreshing');
      const msg = (e && e.message) || 'Couldn’t reach Sleeper.';
      if (e && (e.kind === 'nouser' || e.kind === 'noleague')) { $('who-msg').textContent = msg; say(''); }
      else say(msg.indexOf('Sleeper') >= 0 ? msg + ' Try Refresh again in a minute.' : 'Couldn’t reach Sleeper. Check your connection and press Refresh.', 'neg-c');
    });
  }

  function drawLeagues(cur) {
    const sel = $('league-select');
    sel.replaceChildren(...cur.leagues.map((l) => new Option(l.name + (l.status === 'complete' ? ' (finished)' : ''), l.id)));
    sel.value = cur.leagueId;
    $('league-wrap').hidden = cur.leagues.length < 2;
    $('who-input').value = cur.username;
    const m = {}; (window.dash.data('model').data || []).forEach((r) => { m[r.metric] = r.value; });
    const P = Number(m.playoff_teams), nDiv = Number(m.divisions), wild = P - nDiv, word = (n, a, b) => n + ' ' + (n === 1 ? a : b);
    $('format-note').textContent = nDiv
      ? word(P, 'team makes', 'teams make') + ' it: ' + word(nDiv, 'division winner', 'division winners') + ', then ' + word(wild, 'wildcard', 'wildcards') + ' by record, points for breaking ties.'
      : 'The top ' + word(P, 'team', 'teams') + ' by record make it, points for breaking ties.';
    $('heat-note').textContent = nDiv ? 'Chance of each final seed. Seeds 1 to ' + nDiv + ' go to division winners. Darker means likelier.' : 'Chance of each final seed. Darker means likelier.';
    $('league-line').textContent = (m.league_name || 'Your league') + ' · ' + (m.scoring || '') + ' · ' + (window.dash.data('teams').data || []).length + ' teams';
    const n = $('mae-note'); if (n && m.mae_projection != null) n.textContent = 'Sleeper’s projection missed by ' + m.mae_projection + ' points per player on average over weeks ' + (m.calibration_weeks || '—') + ', scored with your league’s settings.';
  }

  $('rf-btn').addEventListener('click', () => { const c = window.WR.current; pull(c ? c.username : ($('who-input').value || lastName), c ? c.leagueId : null); });
  $('league-select').addEventListener('change', (e) => { const c = window.WR.current; if (c) pull(c.username, e.target.value); });

  // first load: a username in the link (#name), else the last one used on this device, else ask
  const h = decodeURIComponent(location.hash.slice(1));
  const first = (h && !PANES.includes(h) ? h : null) || window.WR.lastUser();
  if (first) pull(first, h && !PANES.includes(h) ? null : window.WR.lastLeague());
  else { say('Type your Sleeper username above and press Show my team.'); $('who-input').focus(); }

  return { pull };
})();
