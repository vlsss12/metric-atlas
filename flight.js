/* Metric Atlas Flight Recorder — public, read-only historical observations. */
(() => {
  const BASE = 'https://raw.githubusercontent.com/vlsss12/metric-atlas/flight-data/data';
  const $ = id => document.getElementById(id);
  const els = Object.fromEntries(['flightPools','flightQuotes','flightEvents','flightEventsNote','flightUpdated','flightFreshness','flightLiveUpdated','flightLiveFreshness','flightCount','flightSearch','flightFilter','flightDate','flightTimeline','flightMore','flightDetailIndex','flightDetailBody'].map(id => [id, $(id)]));
  let archive = null;
  let activeEvents = [];
  let selectedId = null;
  let visible = 12;
  let fetchSerial = 0;
  let archiveRef = {sha:null,checkedAt:0};
  let liveSnapshot = null;
  let liveEvents = [];
  let liveUpdatedAt = null;
  const escape = value => String(value ?? '—').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const dateTime = value => { const date = new Date(value); return Number.isNaN(+date) ? 'Unknown time' : new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(date) + ' UTC'; };
  const elapsed = value => { const minutes = Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000)); return !Number.isFinite(minutes) ? 'Unknown' : minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes/60)}h ${minutes%60}m ago` : `${Math.floor(minutes/1440)}d ago`; };
  const category = event => ['quoteStatus','bidAvailable','askAvailable','token0Depth','token1Depth'].includes(event.category) ? 'quote' : ['admin','provider','providerStatus','pause','locked','stopLoss'].includes(event.category) ? 'controls' : 'listing';
  const liveFields = {
    tier:['Risk tier','classificationSummary.tierQualification'], admin:['Pool admin','admin'], provider:['Price Provider','priceProviderAddress'],
    providerStatus:['Price Provider status','priceProviderStatus'], pause:['Pause level','pauseLevel'], locked:['Pricing lock','lockedPricing'],
    stopLoss:['StopLoss configuration','extensionDetails.stopLoss'], excluded:['Metric Pools listing','blacklistedOnly=true response'],
    newPool:['Pool first observed','Complete metadata response']
  };
  const compact = value => value == null ? 'not reported' : typeof value === 'boolean' ? value ? 'yes' : 'no' : String(value).slice(0,180);
  const currentEvents = () => [...liveEvents, ...(archive?.events || [])];
  function showEventCount() {
    els.flightEvents.textContent=currentEvents().length.toLocaleString();
    els.flightEventsNote.textContent=`${(archive?.events||[]).length.toLocaleString()} archived · ${liveEvents.length.toLocaleString()} live in this tab`;
  }
  function normalizeLive(pool,excluded) {
    const chainId={ethereum:1,BSC:56,Robinhood:4663}[pool.chain];
    const address=String(pool.poolAddress||'');
    if(!chainId||!/^0x[0-9a-fA-F]{40}$/.test(address))return null;
    return {poolKey:`${chainId}:${address.toLowerCase()}`,pair:String(pool.pair||'Unknown pair').slice(0,100),chain:pool.chain,address,
      tier:pool.classificationSummary?.tierQualification||'unknown',admin:String(pool.admin||'').toLowerCase(),
      provider:String(pool.priceProviderAddress||'').toLowerCase(),providerStatus:String(pool.priceProviderStatus||'unknown').toLowerCase(),
      pause:pool.pauseLevel??null,locked:pool.lockedPricing??null,stopLoss:JSON.stringify(pool.extensionDetails?.stopLoss??null),excluded};
  }
  function liveEvent(pool,field,before,after,observedAt) {
    const [label,sourceField]=liveFields[field];
    const attention=(['providerStatus'].includes(field)&&!['healthy','ok'].includes(after)) || (field==='pause'&&after!==0&&after!==null) || (field==='excluded'&&after===true);
    return {id:`live-${Date.now()}-${pool.poolKey}-${field}`,local:true,observedAt,poolKey:pool.poolKey,pair:pool.pair,chain:pool.chain,address:pool.address,
      category:field,title:field==='newPool'?label:label+' changed',before:compact(before),after:compact(after),sourceField,
      sourceUrl:'https://docs.metric.xyz/reference/api/metadata',severity:attention?'attention':'change'};
  }
  function handleLiveUpdate(detail) {
    const observedAt=detail?.updatedAt||new Date().toISOString();
    const excluded=new Set(detail?.excludedKeys||[]);
    const next=new Map();
    for(const pool of detail?.pools||[]) {const row=normalizeLive(pool,excluded.has(`${{ethereum:1,BSC:56,Robinhood:4663}[pool.chain]}:${String(pool.poolAddress||'').toLowerCase()}`));if(row)next.set(row.poolKey,row);}
    const changes=[];
    if(liveSnapshot) {
      for(const [key,pool] of next) {
        const old=liveSnapshot.get(key);
        if(!old) {changes.push(liveEvent(pool,'newPool','not in previous live check',pool.excluded?'excluded':'listed',observedAt));continue;}
        for(const field of ['tier','admin','provider','providerStatus','pause','locked','stopLoss','excluded'])
          if(old[field]!==pool[field])changes.push(liveEvent(pool,field,old[field],pool[field],observedAt));
      }
      for(const [key,old] of liveSnapshot) if(!next.has(key)) {const event=liveEvent(old,'newPool','returned previously','not returned in latest complete live check',observedAt);event.title='Pool not returned in latest complete live check';event.severity='unconfirmed';changes.push(event);}
    }
    liveSnapshot=next;
    liveUpdatedAt=observedAt;
    liveEvents=[...changes,...liveEvents].slice(0,100);
    els.flightLiveUpdated.textContent=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(observedAt))+' UTC';
    els.flightLiveFreshness.textContent=`${elapsed(observedAt)} · ${next.size.toLocaleString()} pools checked · every 60s`;
    showEventCount();
    if(!els.flightDate.value&&changes.length) {activeEvents=currentEvents();render();}
  }
  const note = event => {
    if (event.local) return 'Detected by this browser during a successful one-minute metadata check. This observation is not in the shared archive and will disappear when this tab closes. Verify important changes with Metric and onchain.';
    if (event.severity === 'unconfirmed') return 'The pool was absent from a complete metadata pass. Verify its status with Metric; absence alone does not prove removal.';
    if (event.category === 'newPool') return 'This pool appeared in a complete metadata pass after being absent from the preceding pass. First observation does not prove the contract was deployed at this time.';
    if (event.category === 'excluded') return event.after === 'yes' ? 'The pool appeared in Metric’s excluded-pool response. Check the official interface before acting.' : 'The pool no longer appeared in the excluded-pool response at this collection.';
    if (category(event) === 'quote') return 'A sampled public quote changed. This does not establish onchain execution or the reason for the change.';
    return 'A public metadata field changed between successful collections. Review the pool and neighboring observations.';
  };
  async function resolveRef() {
    if(archiveRef.sha && Date.now()-archiveRef.checkedAt<120000) return archiveRef.sha;
    try {
      const response=await fetch(`https://api.github.com/repos/vlsss12/metric-atlas/git/ref/heads/flight-data?t=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
      if(!response.ok) throw new Error(`Archive ref ${response.status}`);
      const payload=await response.json();
      if(!/^[0-9a-f]{40}$/.test(payload?.object?.sha||'')) throw new Error('Invalid archive ref');
      archiveRef={sha:payload.object.sha,checkedAt:Date.now()};
      return archiveRef.sha;
    } catch(error) {
      if(archiveRef.sha) return archiveRef.sha;
      return 'flight-data';
    }
  }
  async function getJson(path) {
    const sha=await resolveRef();
    const response=await fetch(`${BASE.replace('/flight-data/','/'+sha+'/')}/${path}`,{cache:'no-store'});
    if(!response.ok) throw new Error(`Archive request ${response.status}`);
    return response.json();
  }
  async function updateArchive() {
    const serial=++fetchSerial;
    try {
      const payload=await getJson('flight-recorder.json');
      if(serial!==fetchSerial) return;
      if(!payload || payload.schemaVersion!==1 || !Array.isArray(payload.events) || !payload.coverage) throw new Error('Invalid archive');
      archive=payload;
      els.flightPools.textContent=Number(payload.coverage.pools||0).toLocaleString();
      els.flightQuotes.textContent=Number(payload.coverage.quoteSampled||0).toLocaleString();
      showEventCount();
      els.flightUpdated.textContent=payload.generatedAt ? new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(new Date(payload.generatedAt))+' UTC' : 'Pending';
      const age=Date.now()-new Date(payload.generatedAt).getTime();
      els.flightFreshness.textContent=payload.generatedAt ? `${dateTime(payload.generatedAt)} · ${elapsed(payload.generatedAt)}${age>15*60000?' · Delayed':''}${payload.coverage.quoteErrors?.length?' · quote sample partial':''}` : 'Waiting for first collection';
      if(!els.flightDate.value) { activeEvents=currentEvents(); render(); }
      else await updateDaily();
    } catch (error) {
      if(serial!==fetchSerial) return;
      els.flightFreshness.textContent=archive?.generatedAt?`Last available: ${dateTime(archive.generatedAt)}`:'No successful archive loaded';
      if(!archive) { els.flightCount.textContent='The historical archive could not be loaded.'; els.flightTimeline.innerHTML='<div class="flight-empty">The archive is temporarily unavailable. Try again shortly.</div>'; }
    }
  }
  async function updateDaily() {
    const value=els.flightDate.value;
    if(!value) {activeEvents=currentEvents();render();return;}
    const serial=fetchSerial;
    els.flightCount.textContent=`Loading ${value}…`;
    try { const daily=await getJson(`events/${value}.json`); if(serial!==fetchSerial||els.flightDate.value!==value)return; activeEvents=Array.isArray(daily.events)?daily.events:[]; render(); }
    catch { if(serial!==fetchSerial||els.flightDate.value!==value)return; activeEvents=[]; render('No archive file for this UTC date. Collection may not have started yet.'); }
  }
  function filtered() {
    const query=els.flightSearch.value.trim().toLowerCase(); const filter=els.flightFilter.value;
    return activeEvents.filter(event => (!query || `${event.pair} ${event.address} ${event.chain}`.toLowerCase().includes(query)) && (filter==='all'||filter==='attention'&&event.severity==='attention'||filter===category(event))).sort((a,b)=>String(b.observedAt).localeCompare(String(a.observedAt)));
  }
  function render(emptyMessage) {
    const rows=filtered();
    els.flightCount.textContent=`${rows.length.toLocaleString()} observation${rows.length===1?'':'s'}${els.flightDate.value?' on '+els.flightDate.value+' UTC':' in recent history'}`;
    if(!rows.length) {
      els.flightTimeline.innerHTML=`<div class="flight-empty"><span aria-hidden="true">◎</span><strong>${escape(emptyMessage||'No matching observations yet')}</strong><p>${emptyMessage?'Select another UTC date or return to recent history.':'The first successful collection sets a baseline. Changes appear after a later pass.'}</p></div>`;
      els.flightMore.hidden=true;
      renderDetail(null,rows);
      return;
    }
    els.flightTimeline.innerHTML=rows.slice(0,visible).map(event=>`<button class="flight-event ${event.id===selectedId?'selected':''}" type="button" data-flight-id="${escape(event.id)}"><span class="flight-event-rail"><i></i></span><span class="flight-event-body"><span class="flight-event-meta">${escape(dateTime(event.observedAt))}<span class="flight-event-tag ${escape(event.severity)} ${event.local?'live':''}">${escape(event.local?(event.severity==='attention'?'LIVE · CHECK':'LIVE'):event.severity==='attention'?'CHECK':event.severity==='unconfirmed'?'VERIFY':'CHANGE')}</span></span><strong>${escape(event.title)}</strong><span class="flight-event-pool">${escape(event.pair)} <span>· ${escape(event.chain)} · ${escape(event.address ? `${event.address.slice(0,6)}…${event.address.slice(-4)}` : 'unknown address')}</span></span><span class="flight-event-values">${escape(event.before)} <b>→</b> ${escape(event.after)}</span></span><span class="flight-event-arrow" aria-hidden="true">↗</span></button>`).join('');
    els.flightMore.hidden=rows.length<=visible;
    els.flightMore.textContent=`Show more observations ↓  ${Math.min(visible,rows.length)} / ${rows.length}`;
    const chosen=rows.find(item=>item.id===selectedId)||rows[0]; selectedId=chosen.id;
    els.flightTimeline.querySelector(`[data-flight-id="${CSS.escape(selectedId)}"]`)?.classList.add('selected');
    renderDetail(chosen,rows);
  }
  function renderDetail(event,rows) {
    if(!event) {els.flightDetailIndex.textContent='—';els.flightDetailBody.innerHTML='<div class="flight-detail-empty"><span aria-hidden="true">◎</span><h3 id="flightDetailTitle">Select an observation</h3><p>Choose an event from the timeline to inspect its source, values, and neighboring changes.</p></div>';return;}
    const index=rows.findIndex(item=>item.id===event.id)+1;
    els.flightDetailIndex.textContent=`${String(index).padStart(2,'0')} / ${String(rows.length).padStart(2,'0')}`;
    const near=currentEvents().filter(item=>item.poolKey===event.poolKey&&item.id!==event.id&&Math.abs(new Date(item.observedAt)-new Date(event.observedAt))<=30*60000).slice(0,4);
    const source=String(event.sourceUrl||'').startsWith('https://docs.metric.xyz/')?event.sourceUrl:'https://docs.metric.xyz/reference/api/metadata';
    els.flightDetailBody.innerHTML=`<div class="flight-detail-content"><div class="flight-detail-icon" aria-hidden="true">◈</div><span class="flight-detail-kicker">${escape(dateTime(event.observedAt))} · ${escape(category(event).toUpperCase())}</span><h3 id="flightDetailTitle">${escape(event.title)}</h3><p class="flight-detail-pool">${escape(event.pair)} · ${escape(event.chain)}</p><div class="flight-comparison"><div><span>BEFORE</span><strong>${escape(event.before)}</strong></div><span class="flight-comparison-arrow">→</span><div><span>OBSERVED</span><strong>${escape(event.after)}</strong></div></div><p class="flight-explain">${escape(note(event))}</p><dl class="flight-evidence"><div><dt>POOL ADDRESS</dt><dd>${escape(event.address)}</dd></div><div><dt>SOURCE FIELD</dt><dd>${escape(event.sourceField)}</dd></div><div><dt>OBSERVED AT</dt><dd>${escape(dateTime(event.observedAt))}</dd></div></dl><div class="flight-detail-links"><a href="${escape(source)}" target="_blank" rel="noopener noreferrer">Source method ↗</a><button id="flightExport" type="button">Export evidence ↓</button></div>${near.length?`<div class="flight-near"><span>NEARBY OBSERVATIONS · ±30 MIN</span>${near.map(item=>`<div>${escape(item.title)} <small>${escape(dateTime(item.observedAt))}</small></div>`).join('')}<p>Timing suggests what to inspect; it does not prove causation.</p></div>`:''}</div>`;
    $('flightExport')?.addEventListener('click',()=>{const data={...event,archiveGeneratedAt:archive?.generatedAt,liveCheckAt:liveUpdatedAt,interpretation:note(event),verification:'Public API observation; not onchain proof'};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`metric-atlas-evidence-${event.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  }
  els.flightTimeline.addEventListener('click',event=>{const row=event.target.closest('[data-flight-id]');if(!row)return;selectedId=row.dataset.flightId;render();});
  els.flightSearch.addEventListener('input',()=>{visible=12;render();});
  els.flightFilter.addEventListener('change',()=>{visible=12;render();});
  els.flightDate.addEventListener('change',()=>{visible=12;selectedId=null;updateDaily();});
  els.flightMore.addEventListener('click',()=>{visible+=12;render();});
  window.addEventListener('metric:pools-updated',event=>handleLiveUpdate(event.detail));
  window.addEventListener('metric:pools-error',()=>{els.flightLiveFreshness.textContent=liveUpdatedAt?`API check failed · last success ${elapsed(liveUpdatedAt)}`:'API check failed · retrying in one minute';});
  updateArchive();
  setInterval(updateArchive,60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateArchive();});
})();
