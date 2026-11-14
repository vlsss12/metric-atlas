/* Mission Control: evidence from complete, successful Metric metadata refreshes. */
(() => {
  const STORAGE_KEY = 'metric-atlas:mission-observations:v1';
  const SOURCE = 'https://docs.metric.xyz/reference/api/metadata';
  const MAX_RECORDS = 600;
  const $m = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[char]));
  const date = iso => iso ? new Date(iso).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}) : '—';
  const shortAddress = value => value ? value.slice(0, 8) + '…' + value.slice(-6) : '—';
  const chainNumber = pool => ({ethereum:1,BSC:56,Robinhood:4663})[pool.chain] || pool.chain || 'unknown';
  const poolKey = pool => `${chainNumber(pool)}:${String(pool.poolAddress || '').toLowerCase()}`;
  const poolUrl = pool => {
    const base = ({ethereum:'https://etherscan.io/address/',BSC:'https://bscscan.com/address/'})[pool.chain];
    return base && /^0x[a-fA-F0-9]{40}$/.test(pool.poolAddress || '') ? base + pool.poolAddress : null;
  };
  const statusLabel = raw => ({feed_down:'Feed down',pool_refused:'Pool refused'})[raw] || String(raw || 'Provider issue').replaceAll('_', ' ');

  function signals(pool) {
    if (!pool || !/^0x[a-fA-F0-9]{40}$/.test(pool.poolAddress || '')) return [];
    const common = {poolKey:poolKey(pool),pair:pool.pair || 'Unknown pair',chain:pool.chain || 'Unknown chain',address:pool.poolAddress,explorer:poolUrl(pool)};
    const result = [];
    const removed = pool.classificationSummary?.tierQualification === 'black';
    if (removed) result.push({...common,type:'removed',severity:'info',title:'Removed from Metric Pools',summary:'This pool is returned by Metric’s separate excluded-pool list. The contract may still exist onchain.',field:'classificationSummary.tierQualification',value:'black',nextStep:'Check the current Metric listing and pool contract before acting.'});
    if (removed) return result;
    const pause = Number(pool.pauseLevel);
    if (pool.pauseLevel != null && Number.isFinite(pause) && pause > 0) result.push({...common,type:'paused',severity:'high',title:'Pool pause reported',summary:`Metric metadata reports pause level ${pause}. This can affect pool actions.`,field:'pauseLevel',value:String(pause),nextStep:'Verify the pause state and its scope onchain and with the pool operator.'});
    const provider = String(pool.priceProviderStatus || '').toLowerCase();
    if (provider && !['healthy','unknown','pool_paused'].includes(provider)) result.push({...common,type:'provider',severity:provider === 'feed_down' ? 'high' : 'medium',title:statusLabel(provider),summary:`Metric metadata reports Price Provider status “${statusLabel(provider)}”. This is a reported status, not a direct feed freshness measurement.`,field:'priceProviderStatus',value:provider,nextStep:'Check the feed and Price Provider with the pool operator; confirm onchain before acting.'});
    return result;
  }

  function reconcile(previous, pools, checkedAt) {
    const observations = {...previous};
    const returned = new Set();
    const seen = new Set();
    for (const pool of pools) {
      if (!pool?.poolAddress) continue;
      const key = poolKey(pool);
      returned.add(key);
      for (const signal of signals(pool)) {
        const id = `${key}:${signal.type}`;
        seen.add(id);
        const old = observations[id];
        observations[id] = {...signal,id,firstSeen:old?.status === 'active' ? old.firstSeen : checkedAt,lastSeen:checkedAt,status:'active',acknowledged:old?.status === 'active' ? Boolean(old.acknowledged) : false};
      }
    }
    for (const [id, observation] of Object.entries(observations)) {
      if (observation.status === 'active' && returned.has(observation.poolKey) && !seen.has(id)) {
        observations[id] = {...observation,status:'resolved',resolvedAt:checkedAt,lastSeen:checkedAt,acknowledged:false};
      }
    }
    const entries = Object.values(observations).sort((a,b) => Date.parse(b.lastSeen || 0) - Date.parse(a.lastSeen || 0));
    if (entries.length > MAX_RECORDS) {
      const keep = new Set([...entries.filter(item => item.status === 'active'),...entries.filter(item => item.status !== 'active').slice(0, Math.max(0, MAX_RECORDS - entries.filter(item => item.status === 'active').length))].map(item => item.id));
      for (const id of Object.keys(observations)) if (!keep.has(id)) delete observations[id];
    }
    return observations;
  }

  function load() {
    try { const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}; }
    catch { return {}; }
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(observations)); } catch {} }
  let observations = load();
  let currentPools = [];
  let lastCheck = null;
  let refreshError = false;
  let page = 1;
  const PAGE_SIZE = 20;

  function render() {
    const active = Object.values(observations).filter(item => item.status === 'active');
    const currentKeys = new Set(currentPools.map(poolKey));
    const confirmedActive = active.filter(item => currentKeys.has(item.poolKey));
    $m('missionChecked').textContent = lastCheck ? new Intl.NumberFormat('en-US').format(currentPools.length) : '—';
    $m('missionProvider').textContent = lastCheck ? new Intl.NumberFormat('en-US').format(confirmedActive.filter(item => item.type === 'provider').length) : '—';
    $m('missionPaused').textContent = lastCheck ? new Intl.NumberFormat('en-US').format(confirmedActive.filter(item => item.type === 'paused').length) : '—';
    $m('missionUpdated').textContent = lastCheck ? new Date(lastCheck).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—';
    const mode = $m('mission').querySelector('.mission-mode');
    mode.dataset.state = refreshError ? 'error' : lastCheck ? 'live' : 'loading';
    mode.lastElementChild.textContent = refreshError ? 'LATEST CHECK FAILED' : lastCheck ? 'LIVE WHILE OPEN' : 'CONNECTING';
    const filter = $m('missionFilter').value;
    const query = $m('missionSearch').value.trim().toLowerCase();
    const items = Object.values(observations).filter(item => {
      if (filter === 'active' && item.status !== 'active') return false;
      if (filter === 'resolved' && item.status !== 'resolved') return false;
      if (['provider','paused','removed'].includes(filter) && item.type !== filter) return false;
      return !query || [item.pair,item.address,item.chain].some(value => String(value || '').toLowerCase().includes(query));
    }).sort((a,b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      const rank = {high:0,medium:1,info:2};
      if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
      return Date.parse(b.lastSeen || 0) - Date.parse(a.lastSeen || 0);
    });
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    page = Math.min(page,totalPages);
    $m('missionCount').textContent = `${items.length.toLocaleString()} ${items.length === 1 ? 'observation' : 'observations'}${lastCheck ? ' · Last successful check ' + date(lastCheck) : ' · Previous browser observations'}`;
    const slice = items.slice((page - 1) * PAGE_SIZE,page * PAGE_SIZE);
    $m('missionFeed').innerHTML = slice.length ? slice.map(item => {
      const missing = lastCheck && item.status === 'active' && !currentKeys.has(item.poolKey);
      const status = item.status === 'resolved' ? 'Resolved on later check' : !lastCheck ? 'Previous browser observation' : missing ? 'Not returned in latest response' : item.acknowledged ? 'Acknowledged in this browser' : 'Observed condition';
      return `<article class="mission-card ${safe(item.severity)} ${safe(item.status)}"><div class="mission-card-main"><div class="mission-card-top"><span class="mission-severity">${safe(item.severity.toUpperCase())}</span><span class="mission-card-status">${safe(status)}</span></div><h3>${safe(item.title)}</h3><p>${safe(item.summary)}</p><div class="mission-pool"><strong>${safe(item.pair)}</strong><span>${safe(item.chain)} · ${safe(shortAddress(item.address))}</span></div><div class="mission-times"><span>FIRST OBSERVED <b>${safe(date(item.firstSeen))}</b></span><span>LAST CHECKED <b>${safe(date(item.lastSeen))}</b></span></div></div><details><summary>Evidence and next step</summary><div class="mission-evidence"><p><b>Source field</b><code>${safe(item.field)} = ${safe(item.value)}</code></p><p><b>Next step</b>${safe(item.nextStep)}</p><p><b>Data source</b><a href="${SOURCE}" target="_blank" rel="noopener noreferrer">Metric public metadata ↗</a>${item.explorer ? ` · <a href="${safe(item.explorer)}" target="_blank" rel="noopener noreferrer">Pool contract ↗</a>` : ''}</p><small>Observed from a successful API refresh. This record is stored only in this browser.</small></div></details><div class="mission-card-actions">${item.status === 'active' ? `<button type="button" data-mission-ack="${safe(item.id)}">${item.acknowledged ? 'Undo local acknowledgement' : 'Acknowledge locally'}</button>` : `<span>Resolved ${safe(date(item.resolvedAt))}</span>`}</div></article>`;
    }).join('') : `<div class="empty-card">${lastCheck ? 'No conditions match this view. Try another filter or search.' : 'Waiting for a complete Metric API refresh. Previous browser observations will appear here when available.'}</div>`;
    if (items.length > PAGE_SIZE) $m('missionFeed').insertAdjacentHTML('beforeend',`<div class="mission-pager"><button type="button" data-mission-page="prev" ${page === 1 ? 'disabled' : ''}>← Previous</button><span>Page ${page} of ${totalPages}</span><button type="button" data-mission-page="next" ${page === totalPages ? 'disabled' : ''}>Next →</button></div>`);
  }

  window.addEventListener('metric:pools-updated', event => {
    currentPools = event.detail.pools;
    lastCheck = event.detail.updatedAt;
    refreshError = false;
    observations = reconcile(observations,currentPools,lastCheck);
    save(); render();
  });
  window.addEventListener('metric:pools-error', () => { refreshError = true; render(); });
  $m('missionFilter').addEventListener('change',() => { page = 1; render(); });
  $m('missionSearch').addEventListener('input',() => { page = 1; render(); });
  $m('missionFeed').addEventListener('click',event => {
    const ack = event.target.closest('[data-mission-ack]');
    if (ack && observations[ack.dataset.missionAck]) { observations[ack.dataset.missionAck].acknowledged = !observations[ack.dataset.missionAck].acknowledged; save(); render(); return; }
    const paging = event.target.closest('[data-mission-page]');
    if (paging) { page += paging.dataset.missionPage === 'next' ? 1 : -1; render(); $m('missionFeed').scrollIntoView({behavior:'smooth',block:'start'}); }
  });
  window.MetricMission = {signals,reconcile};
  render();
})();
