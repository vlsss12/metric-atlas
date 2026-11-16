const API = 'https://api.metric.xyz/public/v1/evm/metadata';
const REFRESH_MS = 60_000;
const WATCH_KEY = 'metric-command-center:watches:v1';
const SNAP_KEY = 'metric-command-center:snapshots:v1';
const LOG_KEY = 'metric-command-center:changes:v1';
const $ = id => document.getElementById(id);
const state = { pools: [], watches: read(WATCH_KEY, []), snapshots: read(SNAP_KEY, {}), changes: read(LOG_KEY, []), lastUpdate: null, busy: false, page: 1 };

function read(key, fallback) { try { const value=JSON.parse(localStorage.getItem(key)); if(Array.isArray(fallback))return Array.isArray(value)?value:fallback; if(fallback&&typeof fallback==='object')return value&&typeof value==='object'&&!Array.isArray(value)?value:fallback; return value??fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function fmt(n) { if (n==null||!Number.isFinite(+n)) return '—'; const x = +n; return x >= 1e9 ? '$' + (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : '$' + x.toFixed(0); }
function num(n) { return n!=null&&Number.isFinite(+n) ? new Intl.NumberFormat('en-US').format(+n) : '—'; }
function pctBps(n) { return n!=null&&Number.isFinite(+n) ? ((+n) / 100).toFixed(1) + '%' : '—'; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function short(a) { return a ? a.slice(0, 7) + '…' + a.slice(-5) : '—'; }
function tier(p) { const t = p?.classificationSummary?.tierQualification; return ['green','yellow','red','black'].includes(t) ? t : 'unknown'; }
function tierLabel(t) { return ({green:'● Green',yellow:'▲ Yellow',red:'! High risk',black:'× Removed from Metric Pools',unknown:'? Unclassified'})[t]; }
function chainId(p) { return ({ethereum:1,BSC:56,Robinhood:4663})[p.chain] || p.chain || 'unknown'; }
function key(p) { return chainId(p) + ':' + p.poolAddress.toLowerCase(); }
function explorer(p) { const root = ({ethereum:'https://etherscan.io/address/',BSC:'https://bscscan.com/address/'})[p.chain]; return root ? root + encodeURIComponent(p.poolAddress) : null; }
function exactFields(p) { return {listed:true,tier:tier(p),admin:p.admin?.toLowerCase()||'',provider:p.priceProviderAddress?.toLowerCase()||'',locked:p.lockedPricing===true,pause:p.pauseLevel??null,stopLoss:JSON.stringify(p.extensionDetails?.stopLoss||null),adminShare:p.spreadAdminFeeE6??null,protocolShare:p.spreadProtocolFeeE6??null,notional:p.protocolNotionalFeeE8??null,providerStatus:p.priceProviderStatus||'unknown'}; }
const labels = {listed:'API listing',tier:'Risk tier',admin:'Pool admin',provider:'Price Provider',locked:'Pricing lock',pause:'Pause level',stopLoss:'StopLoss configuration',adminShare:'Curator spread share',protocolShare:'Protocol spread share',notional:'Notional fee',providerStatus:'Price provider status'};
function compare(p) { const id=key(p), now=exactFields(p), old=state.snapshots[id]; if(old){ for(const field of Object.keys(now)){ if(JSON.stringify(old[field])!==JSON.stringify(now[field])) state.changes.unshift({id,pair:p.pair,chain:p.chain,field,from:old[field],to:now[field],at:new Date().toISOString()}); } } state.snapshots[id]=now; }
function compareMissing(w) {const old=state.snapshots[w.id];if(old&&old.listed!==false){state.changes.unshift({id:w.id,pair:w.address,chain:'Chain '+w.chainId,field:'listed',from:true,to:false,at:new Date().toISOString()});state.snapshots[w.id]={...old,listed:false};}}
function updateSnapshotStorage() { state.changes=state.changes.slice(0,100); save(SNAP_KEY,state.snapshots); save(LOG_KEY,state.changes); }
async function getJson(url) { const res=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}}); if(!res.ok) throw new Error('Metric API returned '+res.status); return res.json(); }
async function getPoolPass(query) {
  const base=API+'?count=500&include24h=true&'+query;
  const pages=[];
  let offset=0,total=0;
  for(let i=0;i<100;i++){
    const page=await getJson(base+'&offset='+offset);
    if(!Array.isArray(page.data))throw new Error('Metric returned an invalid pool page');
    pages.push(page);
    total=Number(page.total)||page.data.length;
    if(page.nextOffset==null)return {data:pages.flatMap(result=>result.data),total};
    const next=Number(page.nextOffset);
    if(!Number.isFinite(next)||next<=offset)throw new Error('Metric returned an invalid pool cursor');
    offset=next;
  }
  throw new Error('Metric returned too many pool pages');
}
async function getAllPools(query,alternateQuery) {
  const pools=new Map();
  let expected=0;
  for(const sort of [query,alternateQuery,query]){
    const pass=await getPoolPass(sort);
    expected=pass.total;
    for(const pool of pass.data)pools.set(key(pool),pool);
    if(pools.size>=expected)break;
  }
  if(pools.size<expected)throw new Error('Pool pages changed during loading; the complete list will be retried');
  return [...pools.values()];
}
async function refresh() {
  if(state.busy)return; state.busy=true; document.querySelector('.live').dataset.status='loading'; $('liveLabel').textContent=state.lastUpdate?'REFRESHING':'CONNECTING'; $('error').hidden=true;
  try {
    const [regular,excluded]=await Promise.all([getAllPools('minTvlFiat=0&sortBy=volume30d','minTvlFiat=0&sortBy=tvl'),getAllPools('blacklistedOnly=true','blacklistedOnly=true&sortBy=volume30d')]);
    state.pools=[...new Map([...regular,...excluded].map(p=>[key(p),p])).values()];
    const wanted=new Set(state.watches.map(w=>w.id));
    state.watchPools=state.pools.filter(p=>wanted.has(key(p)));
    for(const p of state.watchPools)compare(p);
    const found=new Set(state.watchPools.map(key));for(const w of state.watches)if(!found.has(w.id))compareMissing(w);
    updateSnapshotStorage();
    state.lastUpdate=new Date();
    document.querySelector('.live').dataset.status='live';
    $('liveLabel').textContent='LIVE';
    document.querySelector('.live').title='Last updated '+state.lastUpdate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    render();
    window.dispatchEvent(new CustomEvent('metric:pools-updated',{detail:{pools:state.pools,excludedKeys:[...new Set(excluded.map(key))],updatedAt:state.lastUpdate.toISOString()}}));
  } catch(e) { document.querySelector('.live').dataset.status='error'; $('liveLabel').textContent='OFFLINE'; document.querySelector('.live').title='Live data unavailable'; $('error').hidden=false; $('error').textContent='Live data unavailable: '+e.message+'. '+(state.lastUpdate?'Showing the last successful data from '+state.lastUpdate.toLocaleTimeString()+'. ':'')+'The next automatic retry is in one minute.'; if(!state.lastUpdate){$('poolRows').innerHTML='<tr><td colspan="6" class="empty">Pool data is unavailable. Retrying in one minute.</td></tr>';$('poolCount').textContent='Pool list unavailable';} window.dispatchEvent(new Event('metric:stats-error')); window.dispatchEvent(new CustomEvent('metric:pools-error',{detail:{message:e.message}})); }
  finally {state.busy=false;}
}
function renderOverview(){
  const a=state.pools;
  const tvl=a.reduce((s,p)=>s+(+p.tvlFiat||0),0);
  const volume=a.reduce((s,p)=>s+(+p.analytics24h?.volumeFiat||0),0);
  const swaps=a.reduce((s,p)=>s+(+p.analytics24h?.swapTxCount||0),0);
  $('mPools').textContent=num(a.length);
  $('mTvl').textContent=fmt(tvl);
  $('mVolume').textContent=fmt(volume);
  $('mSwaps').textContent=num(swaps);
  window.dispatchEvent(new CustomEvent('metric:stats',{detail:{pools:a.length,tvl,volume,swaps,updatedAt:state.lastUpdate?.toISOString()}}));
  const cf=$('chainFilter').value, tf=$('tierFilter').value, q=$('poolSearch').value.trim().toLowerCase(), sort=$('sortPools').value;
  const filtered=a.filter(p=>(cf==='all'||p.chain===cf)&&(tf==='all'||tier(p)===tf)&&(!q||[p.pair,p.poolAddress,p.token0Symbol,p.token1Symbol,p.adminUsername,p.admin].some(x=>String(x||'').toLowerCase().includes(q))));
  const metric=p=>sort==='oldest'||sort==='newest'?(+p.createdTimestamp||0):sort==='volume'?(+p.analytics24h?.volumeFiat||0):sort==='markout'?(+p.markoutByWindow?.['7d']?.byHorizon?.['5m']?.aprBps??-Infinity):(+p.tvlFiat||0);
  filtered.sort((x,y)=>{if(sort==='oldest'||sort==='newest'){const xd=+x.createdTimestamp||0,yd=+y.createdTimestamp||0;if(!xd)return yd?1:0;if(!yd)return -1;}return (sort==='oldest'?-1:1)*(metric(y)-metric(x));});
  const pageCount=Math.max(1,Math.ceil(filtered.length/25));state.page=Math.min(state.page,pageCount);
  const rows=filtered.slice((state.page-1)*25,state.page*25);
  $('poolRows').innerHTML=rows.length?rows.map(p=>`<tr><td><strong>${esc(p.pair||'Unknown pair')}</strong><small>${esc(p.chain)} · ${esc(short(p.poolAddress))} · ${p.createdTimestamp?new Date(p.createdTimestamp*1000).toLocaleDateString():'date unavailable'}</small></td><td class="mono">${fmt(p.tvlFiat)}</td><td class="mono">${fmt(p.analytics24h?.volumeFiat)}</td><td class="mono">${pctBps(p.markoutByWindow?.['7d']?.byHorizon?.['5m']?.aprBps)}</td><td><span class="badge ${tier(p)}">${tierLabel(tier(p))}</span></td><td><button class="row-action" data-detail="${esc(key(p))}">Details</button> <button class="row-action" data-watch="${esc(key(p))}">Watch →</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">No pools match these filters.</td></tr>';
  $('poolCount').textContent=num(filtered.length)+' of '+num(a.length)+' indexed pools';$('pageLabel').textContent='Page '+state.page+' / '+pageCount;$('prevPage').disabled=state.page===1;$('nextPage').disabled=state.page===pageCount;
  $('poolRows').querySelectorAll('[data-watch]').forEach(b=>b.addEventListener('click',()=>{const p=a.find(p=>key(p)===b.dataset.watch);if(p)addWatchPool(p);}));
  $('poolRows').querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>{const p=a.find(p=>key(p)===b.dataset.detail);if(p)showPool(p);}));
}
function showPool(p){
  $('dialogTitle').textContent=p.pair+' · '+p.chain;
  const fields=[['Pool address',p.poolAddress],['Created',p.createdTimestamp?new Date(p.createdTimestamp*1000).toLocaleString():'Unavailable'],['Risk tier',tierLabel(tier(p))],['Tier reasons',(p.classificationSummary?.reasonCodes||[]).join(', ')||'None reported'],['TVL',fmt(p.tvlFiat)],['24h volume',fmt(p.analytics24h?.volumeFiat)],['7d volume',fmt(p.volumeByWindow?.['7d'])],['30d volume',fmt(p.volumeByWindow?.['30d'])],['24h swaps',num(p.analytics24h?.swapTxCount)],['7d markout APR · 5m',pctBps(p.markoutByWindow?.['7d']?.byHorizon?.['5m']?.aprBps)],['7d trading PnL APR',pctBps(p.tradingPnlAprBps7d)],['Admin',p.adminUsername?p.adminUsername+' · '+p.admin:p.admin],['Price Provider',p.priceProviderAddress],['Provider status',p.priceProviderStatus||'Not reported'],['Pricing locked',p.lockedPricing?'Yes':'No'],['Pause level',p.pauseLevel??'Not reported'],['StopLoss',p.extensionDetails?.stopLoss?'Attached':'Not reported'],['Curator spread share',p.spreadAdminFeeE6!=null?((+p.spreadAdminFeeE6/10000).toFixed(2)+'% of spread'):'Unavailable'],['Protocol spread share',p.spreadProtocolFeeE6!=null?((+p.spreadProtocolFeeE6/10000).toFixed(2)+'% of spread'):'Unavailable']];
  $('dialogBody').innerHTML=`${tier(p)==='black'?'<div class="removed-notice"><strong>Removed from Metric Pools</strong><span>Metric’s API classifies this pool as blacklisted. Its contract may still exist onchain.</span></div>':''}<div class="detail-grid">${fields.map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div><details><summary>Full API metadata record</summary><pre>${esc(JSON.stringify(p,null,2))}</pre></details><p class="footnote">Metric API values are shown as reported. Verify addresses and current state onchain before taking action.</p>`;
  $('poolDialog').showModal();
}
function renderWatches(){
  const byId=new Map((state.watchPools||[]).map(p=>[key(p),p]));
  $('watchCards').innerHTML=state.watches.length?state.watches.map(w=>{const p=byId.get(w.id);if(!p)return `<article class="watch-card"><div class="watch-head"><div><h3>${esc(short(w.address))}</h3><small>Chain ${esc(w.chainId)}</small></div><button class="text-button" data-remove="${esc(w.id)}">Remove</button></div><div class="removed-notice"><strong>No longer returned by the public API</strong><span>Its listing status cannot be confirmed. Check Metric and the chain before acting.</span></div></article>`; const x=explorer(p);return `<article class="watch-card"><div class="watch-head"><div><h3>${esc(p.pair||'Unknown pair')}</h3><small>${esc(p.chain)} · ${esc(short(p.poolAddress))}</small></div><span class="badge ${tier(p)}">${tierLabel(tier(p))}</span></div>${tier(p)==='black'?'<div class="removed-notice"><strong>Removed from Metric Pools</strong><span>Its contract may still exist onchain.</span></div>':''}<div class="watch-meta"><div><span>TVL</span><strong>${fmt(p.tvlFiat)}</strong></div><div><span>24H VOLUME</span><strong>${fmt(p.analytics24h?.volumeFiat)}</strong></div><div><span>MARKOUT · 7D</span><strong>${pctBps(p.markoutByWindow?.['7d']?.byHorizon?.['5m']?.aprBps)}</strong></div></div><div class="watch-flags"><span class="flag">${p.lockedPricing?'✓':'!'} Pricing ${p.lockedPricing?'locked':'mutable'}</span><span class="flag">${p.pauseLevel?'! Paused':'✓ Active'}</span><span class="flag">Provider: ${esc(p.priceProviderStatus||'unknown')}</span><span class="flag">Admin: ${esc(p.adminUsername||short(p.admin))}</span></div><div class="watch-actions">${x?`<a href="${x}" target="_blank" rel="noopener">Pool explorer ↗</a>`:'<span></span>'}<button data-remove="${esc(w.id)}">Remove watch</button></div></article>`}).join(''):'<div class="empty-card">No watched pools yet. Select a pool from the Overview or paste its address above.</div>';
  $('watchCards').querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{state.watches=state.watches.filter(w=>w.id!==b.dataset.remove);save(WATCH_KEY,state.watches);renderWatches();}));
  $('changeLog').innerHTML=state.changes.length?state.changes.slice(0,30).map(c=>`<div class="log-row"><span class="log-dot"></span><div><strong>${esc(c.pair)} · ${esc(labels[c.field]||c.field)} changed</strong><small>${esc(c.chain)} · ${esc(new Date(c.at).toLocaleString())} · ${esc(String(c.from).slice(0,65))} → ${esc(String(c.to).slice(0,65))}</small></div></div>`).join(''):'<div class="empty-card">No changes observed yet.</div>';
}
function render(){renderOverview();renderWatches();}
function addWatchPool(p){const w={id:key(p),chainId:chainId(p),address:p.poolAddress};if(!state.watches.some(x=>x.id===w.id))state.watches.push(w);save(WATCH_KEY,state.watches);state.watchPools=state.pools.filter(pool=>state.watches.some(watch=>watch.id===key(pool)));compare(p);updateSnapshotStorage();$('watchMessage').textContent='Watching '+p.pair+' on '+p.chain+'.';setView('sentinel');renderWatches();}
async function addWatchAddress(){const address=$('watchAddress').value.trim();if(!/^0x[a-fA-F0-9]{40}$/.test(address)){$('watchMessage').textContent='Enter a valid 0x pool address (40 hexadecimal characters).';return;}if(!state.lastUpdate){$('watchMessage').textContent='The live pool list is still loading. Try again after it appears.';return;}const cid=$('watchChain').value;const p=state.pools.find(p=>p.poolAddress.toLowerCase()===address.toLowerCase()&&(cid==='all'||chainId(p)===+cid));if(p){$('watchAddress').value='';addWatchPool(p);return;}$('watchMessage').textContent='Pool not found in the current API pool universe. Refresh and try again.';}
function setView(name,push=true){if(!['overview','sentinel','mission','flight','market'].includes(name))return;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active-view',v.id===name));document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(push&&location.hash!=='#'+name)history.pushState({},'','#'+name);window.scrollTo({top:0,behavior:'smooth'});}
function val(id){const el=$(id),n=Number(el.value);if(!Number.isFinite(n))return 0;const min=el.min===''?-Infinity:Number(el.min),max=el.max===''?Infinity:Number(el.max);return Math.min(max,Math.max(min,n));}
function preflight(){
  const liquidity=val('liquidity'),spread=val('spread'),fresh=val('freshness'),bin=val('binWidth'),stop=val('stopLoss'),shock=val('shock'),anchored=$('pricing').value==='anchored',immutable=$('immutable').checked,withdrawal=$('withdrawal').checked;
  const pair=$('pair').value.trim()||'Proposed market', chain=$('marketChain').selectedOptions[0]?.textContent||'Selected chain';
  const checks=[
    ['Liquidity exceeds typical aggregator threshold',liquidity>=1000,liquidity<1000?'Metric says many aggregators need roughly $1,000 of pool liquidity.':'Thresholds differ by aggregator.'],
    ['Price Provider and StopLoss are immutable',immutable,'Required for the documented public-pool baseline.'],
    ['Bin width is at most 1%',bin>0&&bin<=1,'A larger bin width fails the documented baseline.'],
    ['StopLoss drawdown is at most 15%',stop>0&&stop<=15,'The first monitored trade remains an exception.'],
    ['No withdrawal extension',!withdrawal,'A withdrawal extension can block LP exits.'],
    ['Anchored pricing with ≤15s freshness',anchored&&fresh>0&&fresh<=15,'Needed for a green-tier candidate; feed and curator still require verification.']
  ];
  const passed=checks.filter(x=>x[1]).length;
  $('readiness').innerHTML=`<span class="score">${passed}/6</span><div><strong>${esc(pair)} · ${esc(chain)}</strong><small>${passed===6?'Baseline candidate; still requires verified curator, correct feed mapping, initialized safeguards and live checks.':'Configuration needs work. These checks are not an official Metric tier assignment.'}</small></div>`;
  $('checks').innerHTML=checks.map(([label,ok,detail])=>`<div class="check-row"><span class="icon" style="color:${ok?'var(--green)':'var(--yellow)'}">${ok?'✓':'!'}</span><div><strong>${esc(label)}</strong><small>${esc(detail)}</small></div></div>`).join('');
  const netBps=Math.max(0,shock*100-spread);const exposure=liquidity*.5*netBps/10000;
  $('shockResult').textContent=netBps.toFixed(0)+' bps · '+fmt(exposure);
  $('shockExplain').textContent=`Illustration: after a ${shock.toFixed(1)}% adverse price jump, a ${spread.toFixed(0)} bps half-spread leaves ${netBps.toFixed(0)} bps gap. Dollar figure assumes 50% of the initial liquidity is filled at a stale quote. It is not a Metric execution simulation or predicted loss.`;
}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('refresh').addEventListener('click',refresh);
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();setView('overview');});
window.addEventListener('popstate',()=>setView(location.hash.slice(1)||'overview',false));
window.addEventListener('hashchange',()=>setView(location.hash.slice(1)||'overview',false));
$('chainFilter').addEventListener('change',()=>{state.page=1;renderOverview();});
$('tierFilter').addEventListener('change',()=>{state.page=1;renderOverview();});
$('poolSearch').addEventListener('input',()=>{state.page=1;renderOverview();});
$('sortPools').addEventListener('change',()=>{state.page=1;renderOverview();});
$('prevPage').addEventListener('click',()=>{state.page--;renderOverview();});
$('nextPage').addEventListener('click',()=>{state.page++;renderOverview();});
$('closeDialog').addEventListener('click',()=>$('poolDialog').close());
$('addWatch').addEventListener('click',addWatchAddress);
$('watchAddress').addEventListener('keydown',e=>{if(e.key==='Enter')addWatchAddress();});
$('clearHistory').addEventListener('click',()=>{state.changes=[];save(LOG_KEY,[]);renderWatches();});
$('runPreflight').addEventListener('click',preflight);
document.querySelectorAll('#market input,#market select').forEach(el=>el.addEventListener('change',preflight));
document.querySelectorAll('#market input[type="number"],#market input[type="text"]').forEach(el=>el.addEventListener('input',preflight));
setView(['overview','sentinel','mission','flight','market'].includes(location.hash.slice(1))?location.hash.slice(1):'overview',false);
preflight();refresh();setInterval(refresh,REFRESH_MS);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!state.lastUpdate||Date.now()-state.lastUpdate>REFRESH_MS))refresh();});
