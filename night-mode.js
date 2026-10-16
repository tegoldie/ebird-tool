/* Descriptive night records, integrated into the existing report shell. */
(() => {
  'use strict';
  const original = {initControls, applyHashState, render, syncControls, baseFilteredSites,
    ensureSiteDetails, ensureSpecies, selectSpecies, selectHotspot, showSingleHotspot,
    toggleSiteDetails, renderSpeciesSuggestions, renderHotspotSuggestions};
  const day = {state, speciesNames, sites:null, viewport:null, details:[], scroll:0};
  let mode='day', night=null, loading=null, change=0, busy=false, pendingHash=null, shellReady=false;
  const pendingDay=new Set();
  const number=n=>Number(n).toLocaleString('en-AU');
  const date=s=>new Date(s+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  const active=()=>mode==='night';
  const nocturnalCount=s=>s.species.filter(p=>night.preset.has(p.name)).length;
  const reporting=s=>s.species.find(p=>p.name===state.species);
  let dayInfo, dayTechnical, button, introduction, message, ordering;

  function defaultNightState(){return {region:'sydney-core',lastBroadRegion:'sydney-core',regionChoice:slug(subregions[0]),threshold:'off',sort:'overall',month:9,species:'',speciesReturn:null,hotspot:'',mapOpen:true,mapNeedsFit:true,focusSelectedHotspot:false,infoOpen:false,technicalInfoOpen:false,selectedSite:null,siteViews:{},siteDetails:{},hashReady:true,mapRenderToken:0,otherOpen:{},speciesOpen:{}}}
  async function loadNight(){
    if(night)return night;
    if(!loading)loading=fetchJson('data/night.json').then(data=>{
      if(!Array.isArray(data.hotspots)||!Array.isArray(data.species)||!Array.isArray(data.nocturnalSpecies))throw new Error('Invalid night dataset');
      const preset=new Set(data.nocturnalSpecies);
      const nightSites=data.hotspots.map(h=>({...h,detailsLoaded:true,species:h.sp.map(([i,n,last])=>({name:data.species[i],checklists:n,last})).sort((a,b)=>b.checklists-a.checklists||b.last.localeCompare(a.last)||a.name.localeCompare(b.name))}));
      night={data,preset,sites:nightSites,state:defaultNightState(),viewport:null,scroll:0};return night;
    }).catch(error=>{loading=null;throw error});
    return loading;
  }
  function readNightHash(p){
    const s=night.state;
    if(['sydney-core','sydney-and-surrounds','choose-region'].includes(p.get('r')))s.region=p.get('r');
    if(s.region!=='choose-region')s.lastBroadRegion=s.region;
    if(subregions.some(r=>slug(r)===p.get('sub')))s.regionChoice=p.get('sub');
    if(night.data.species.includes(p.get('sp')))s.species=p.get('sp');
    const selected=night.sites.find(h=>h.id===p.get('h'));
    if(selected){s.hotspot=selected.name;s.selectedSite=selected.id;s.siteDetails[selected.id]=true}
    const ids=new Set(night.sites.map(h=>h.id));
    (p.get('open')||'').split(',').filter(id=>ids.has(id)).slice(0,100).forEach(id=>s.siteDetails[id]=true);
  }
  function writeNightHash(){
    const p=new URLSearchParams({mode:'night',r:state.region});
    if(state.region==='choose-region')p.set('sub',state.regionChoice);
    if(state.species)p.set('sp',state.species);
    if(state.hotspot)p.set('h',state.selectedSite);
    const open=Object.keys(state.siteDetails).filter(id=>state.siteDetails[id]);
    if(open.length)p.set('open',open.slice(0,100).join(','));
    history.replaceState(null,'',`${location.pathname}${location.search}#${p}`);
  }
  function capture(view){
    view.scroll=window.scrollY;
    if(window.__siteMap&&state.mapOpen)view.viewport={center:window.__siteMap.getCenter(),zoom:window.__siteMap.getZoom()};
    if(!active())view.details=Array.from(els.reports.querySelectorAll('.site-card')).flatMap(article=>Array.from(article.querySelectorAll('details'),(d,index)=>({id:article.querySelector('[data-site-id]')?.dataset.siteId||article.querySelector('.site-title')?.textContent||article.querySelector('.site-collapse-title')?.textContent,index,open:d.open})));
  }
  function restoreDayDetails(){
    els.reports.querySelectorAll('.site-card').forEach(article=>{
      const id=article.querySelector('[data-site-id]')?.dataset.siteId||article.querySelector('.site-title')?.textContent||article.querySelector('.site-collapse-title')?.textContent;
      article.querySelectorAll('details').forEach((d,index)=>{const prior=day.details.find(x=>x.id===id&&x.index===index);if(prior)d.open=prior.open});
    });
  }
  async function setMode(next,{hash=null}={}){
    if(!['day','night'].includes(next))throw new Error('Unknown mode');
    const token=++change;
    if(next===mode&&!busy)return;
    busy=true;if(button){button.disabled=true;button.textContent=next==='night'?'Loading Night Mode…':'Switching…'}
    message.classList.add('hidden');
    try{
      if(next==='night')await loadNight();
      await Promise.allSettled([...pendingDay]);
      // Let a scheduled day-map render complete before swapping its state reference.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(token!==change)return;
      capture(active()?night:day);
      mode=next;
      if(active()){
        if(hash)readNightHash(hash);
        state=night.state;sites=night.sites;speciesNames=night.data.species;
      }else{state=day.state;sites=day.sites;speciesNames=day.speciesNames}
      document.body.dataset.mode=mode;
      const view=active()?night:day;
      state.mapNeedsFit=!view.viewport;
      els.reports.replaceChildren();
      els.info.innerHTML=active()?nightInfo():dayInfo;
      els.technicalInfo.innerHTML=active()?nightTechnical():dayTechnical;
      els.speciesSuggestions.classList.add('hidden');els.hotspotSuggestions.classList.add('hidden');
      render();
      if(!active())restoreDayDetails();
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(token!==change)return;
        if(window.__siteMap&&state.mapOpen&&view.viewport){window.__siteMap.invalidateSize({pan:false});window.__siteMap.setView(view.viewport.center,view.viewport.zoom,{animate:false})}
        window.scrollTo(0,view.scroll||0);
      }));
    }catch(error){
      console.error('Night mode could not be loaded',error);
      message.textContent='Night records could not be loaded. Use the mode button to try again.';
      message.classList.remove('hidden');
      if(!active())original.render();
    }finally{if(token===change){busy=false;syncButton()}}
  }
  function syncButton(){if(button){button.disabled=busy||!shellReady;button.textContent=active()?'☀ Switch to Day Mode':'☾ Switch to Night Mode';button.setAttribute('aria-label',active()?'Switch to Day Mode':'Switch to Night Mode')}}
  function nightInfo(){return `<div class="section technical-content"><h2>Night mode</h2><p>Explore owls (including boobooks), frogmouths, nightjars and owlet-nightjars. Every recorded species in these groups gets a main card, including single records. All other species are available under More species.</p><p>Counts describe submitted records, not your chances of finding a bird or the number of birds present. Coverage varies between places and dates.</p><p>Keep light use short, avoid playback at known roosts or nests, and stay on tracks.</p></div>`}
  function nightTechnical(){const m=night.data.meta;return `<div class="section technical-content"><h2>Night records: scope and method</h2><p>Checklist dates: ${date(m.dataFrom)} to ${date(m.dataTo)}. Generated ${esc(m.generated)}. Source: ${esc(m.source)}.</p><p>Include checklists starting at or after one hour before sunset, or before sunrise, using the hotspot's coordinates, local observation date and Australia/Sydney daylight-saving time. A start exactly one hour before sunset qualifies; a start exactly at sunrise does not. No minimum duration is required. Checklists with missing or invalid start times are excluded.</p><p>This descriptive view intentionally overlaps the day model. The day model's existing time rules and scores are unchanged.</p><p>Complete, incomplete and incidental hotspot checklists are included. Shared group checklists are counted once per hotspot; ungrouped duplicates use the existing metadata fingerprint. Species reported across qualifying group submissions are combined. Introduced species and unidentified “sp.” entries are excluded. Hotspots need no recent-record, multi-observer or minimum-checklist threshold; hotspots without retained species are omitted.</p><p>The nocturnal preset comprises ${night.data.nocturnalSpecies.map(esc).join(', ')} in this extract. All other species appear under More species.</p><p>Default ordering and map colours count species in that preset, then ordering uses total night checklists. With a species selected, order is by reporting checklists, then latest record. Counts are checklist reports, not individual bird totals. No probabilities, abundance estimates or monthly patterns are calculated.</p></div>`}

  initControls=function(){
    original.initControls();day.sites=sites;dayInfo=els.info.innerHTML;dayTechnical=els.technicalInfo.innerHTML;
    button=document.createElement('button');button.className='btn mode-switch';button.type='button';button.id='modeSwitch';button.disabled=true;
    button.addEventListener('click',()=>setMode(active()?'day':'night'));qs('.summary-row').appendChild(button);syncButton();
    introduction=document.createElement('section');introduction.id='nightIntro';introduction.className='night-intro hidden';
    introduction.innerHTML='<h2>Night mode</h2><p>Explore birds recorded on checklists starting from an hour before sunset through to sunrise. Owls, frogmouths, nightjars and owlet-nightjars are highlighted; other birds are under More species. Counts describe submitted records, not your chances of finding a bird.</p>';
    els.infoCard.before(introduction);
    message=document.createElement('p');message.className='night-load-message hidden';message.setAttribute('role','status');introduction.after(message);
    ordering=document.createElement('p');ordering.id='nightOrdering';ordering.className='night-ordering hidden';els.reports.before(ordering);
    els.reports.addEventListener('toggle',event=>{
      if(!active()||!els.reports.contains(event.target))return;
      const d=event.target;
      if(d.matches('details[data-night-species]'))state.speciesOpen[d.dataset.nightSpecies]=d.open;
      if(d.matches('details[data-night-other]')){state.otherOpen[d.dataset.nightOther]=d.open;d.querySelector('.more-species-label').textContent=`More species - ${d.open?'hide':'show'}`}
    },true);
  };
  applyHashState=function(){const p=new URLSearchParams(location.hash.slice(1));if(p.get('mode')==='night'){pendingHash=p;state.hashReady=true}else original.applyHashState()};
  syncControls=function(){
    original.syncControls();syncButton();
    els.sort.closest('.filter-block').classList.toggle('hidden',active());
    els.threshold.closest('.best-hotspots-row').classList.toggle('hidden',active());
    qs('.filter-grid').classList.toggle('night-filter-grid',active());
    introduction?.classList.toggle('hidden',!active());ordering?.classList.toggle('hidden',!active());
    if(active()){els.monthControl.classList.add('hidden');els.resetSiteViews.classList.add('hidden')}
  };
  ensureSiteDetails=async function(id){if(!active())return original.ensureSiteDetails(id)};
  ensureSpecies=async function(name){if(!active())return original.ensureSpecies(name)};
  // Existing handlers continue using the same controls. Day requests finish before
  // switching state, so a delayed fetch cannot write into the other mode.
  function tracked(fn,args){const promise=Promise.resolve(fn(...args));pendingDay.add(promise);promise.finally(()=>pendingDay.delete(promise)).catch(()=>{});return promise}
  selectSpecies=async function(name){
    if(!active())return tracked(original.selectSpecies,[name]);
    if(!night.data.species.includes(name))return;
    exitHotspot();state.species=name;state.mapNeedsFit=true;
    if(!night.preset.has(name))sites.filter(s=>s.species.some(p=>p.name===name)).forEach(s=>state.otherOpen[s.id]=true);
    els.species.value=name;els.speciesSuggestions.classList.add('hidden');render();
  };
  selectHotspot=async function(site,options){if(!active())return tracked(original.selectHotspot,[site,options]);return original.selectHotspot(site,options)};
  showSingleHotspot=async function(id){if(!active())return tracked(original.showSingleHotspot,[id]);return original.showSingleHotspot(id)};
  toggleSiteDetails=async function(id){if(!active())return tracked(original.toggleSiteDetails,[id]);return original.toggleSiteDetails(id)};
  baseFilteredSites=function(){
    if(!active())return original.baseFilteredSites();
    let rows=sites.filter(inRegion);
    if(state.species)rows=rows.filter(reporting).sort((a,b)=>reporting(b).checklists-reporting(a).checklists||reporting(b).last.localeCompare(reporting(a).last)||a.name.localeCompare(b.name));
    else rows.sort((a,b)=>nocturnalCount(b)-nocturnalCount(a)||b.lists-a.lists||a.name.localeCompare(b.name));
    return rows;
  };
  function speciesCard(sp,site){
    const image=speciesImages[sp.name],key=JSON.stringify([site.id,sp.name]);
    const photo=image?`<a class="species-photo-link" href="${esc(image.source)}" target="_blank" rel="noopener noreferrer"><img class="species-photo" src="${esc(image.src)}" alt="${esc(sp.name)}" loading="lazy" decoding="async"></a>`:'';
    const credit=image?`<span class="photo-credit">Photo: ${esc(image.author||'Wikimedia Commons contributor')} · <a href="${esc(image.source)}" target="_blank" rel="noopener noreferrer">${esc(image.license||'Wikimedia Commons')}</a> · cropped</span>`:'';
    return `<article class="species-card ${state.species===sp.name?'night-focal':''}"><div class="species-top ${image?'has-photo':''}">${photo}<div class="species-name">${esc(sp.name)}</div><div class="probability">${number(sp.checklists)}<small>${sp.checklists===1?'checklist':'checklists'}</small></div></div><details data-night-species="${esc(key)}" ${state.speciesOpen[key]?'open':''}><summary>More details</summary><div class="detail-row night-date"><span><b>${date(sp.last)}</b> latest record</span></div>${credit}</details></article>`;
  }
  function siteHtml(site){
    const open=!!state.siteDetails[site.id],count=nocturnalCount(site),focal=reporting(site);
    const metrics=`<div class="night-total metric"><strong>${number(site.lists)}</strong><span>Night checklists total</span></div><div class="night-count">${focal?`<strong>${number(focal.checklists)}</strong> checklists<br>reporting ${esc(focal.name)}`:`<strong>${count}</strong> nocturnal<br>species recorded`}</div>`;
    if(!open)return `<article class="site-card site-card-collapsed"><button class="site-collapse-head night-head" type="button" onclick="toggleSiteDetails('${site.id}')"><div><h2 class="site-collapse-title">${esc(site.name)}</h2><div class="site-collapse-meta">${esc(site.region)}</div></div>${metrics}<span class="site-collapse-prompt">Show details ↓</span></button></article>`;
    const main=site.species.filter(p=>night.preset.has(p.name)),other=site.species.filter(p=>!night.preset.has(p.name));
    const otherExpanded=state.otherOpen[site.id]??other.some(p=>p.name===state.species);
    return `<article class="site-card site-card-open"><header class="site-header night-header"><div><h2 class="site-title">${esc(site.name)}</h2><div class="site-meta"><span>${esc(site.region)}</span><a href="https://ebird.org/hotspot/${site.id}" target="_blank" rel="noopener noreferrer">eBird link</a></div><button class="btn site-location-action" type="button" onclick="showSingleHotspot('${site.id}')">See hotspot location</button></div><div class="site-header-side"><button class="site-hide-details" type="button" onclick="toggleSiteDetails('${site.id}')">Hide details ↑</button><div class="night-metrics">${metrics}</div></div></header><section class="section"><p class="section-note">Ordered by number of night checklists reporting each species</p>${main.length?`<div class="species-grid">${main.map(p=>speciesCard(p,site)).join('')}</div>`:'<p class="empty">No species from the nocturnal preset recorded on these checklists.</p>'}${other.length?`<details class="supporting night-other" data-night-other="${site.id}" ${otherExpanded?'open':''}><summary><span class="more-species-label">More species - ${otherExpanded?'hide':'show'}</span><span>${other.length} other species</span></summary><div class="chip-wrap">${other.map(p=>`<span class="species-chip ${state.species===p.name?'night-focal':''}">${esc(p.name)} <b>${number(p.checklists)} ${p.checklists===1?'checklist':'checklists'}</b></span>`).join('')}</div></details>`:''}</section></article>`;
  }
  function renderMap(rows){
    const selectedSpecies=!!state.species;
    const bands=selectedSpecies?[[1,'1–2','white'],[3,'3–5','#3989ff'],[6,'6+','#ffd544']]:[[0,'0','#718097'],[1,'1–2','white'],[3,'3–5','#3989ff'],[6,'6+','#ffd544']];
    els.legend.innerHTML=`<h3 class="legend-title">${selectedSpecies?`Night checklists reporting ${esc(state.species)}`:'Nocturnal species recorded'}</h3>`+bands.map(([,label,color])=>`<div class="legend-row"><span class="swatch" style="background:${color}"></span>${label}</div>`).join('');
    if(!state.mapOpen)return;
    const currentState=state;const token=++state.mapRenderToken;
    requestAnimationFrame(()=>{
      if(!active()||state!==currentState||token!==state.mapRenderToken||!state.mapOpen)return;
      if(!window.L){els.map.innerHTML='<p class="empty">Map library unavailable.</p>';return}
      if(!window.__siteMap){window.__siteMap=L.map('mockMap');L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'}).addTo(window.__siteMap);window.__siteMarkerLayer=L.layerGroup().addTo(window.__siteMap);window.__siteSelectionLayer=L.layerGroup().addTo(window.__siteMap)}
      window.__siteMarkerLayer.clearLayers();window.__siteSelectionLayer.clearLayers();const bounds=[];
      [...rows].sort((a,b)=>(selectedSpecies?reporting(a)?.checklists||0:nocturnalCount(a))-(selectedSpecies?reporting(b)?.checklists||0:nocturnalCount(b))).forEach(site=>{
        if(!Number.isFinite(site.x)||!Number.isFinite(site.y))return;
        const n=selectedSpecies?reporting(site)?.checklists||0:nocturnalCount(site),color=n>=6?'#ffd544':n>=3?'#3989ff':n>=1?'white':'#718097';
        L.circleMarker([site.y,site.x],{radius:6,color:'#27344a',weight:1.5,fill:true,fillColor:color,fillOpacity:.95}).addTo(window.__siteMarkerLayer).bindTooltip(`${esc(site.name)} - ${number(n)} ${selectedSpecies?'reporting checklists':'nocturnal species'}`).on('click',()=>{selectHotspot(site,{fromMap:true});els.reports.scrollIntoView({behavior:'smooth',block:'start'})});bounds.push([site.y,site.x]);
      });
      const selected=state.hotspot?rows.find(s=>s.id===state.selectedSite):null;
      if(selected)L.circleMarker([selected.y,selected.x],{radius:11,color:'#111',weight:3,fill:false,interactive:false}).addTo(window.__siteSelectionLayer);
      window.__siteMap.invalidateSize({pan:false});
      if(selected&&state.focusSelectedHotspot)window.__siteMap.setView([selected.y,selected.x],10);
      else if(state.mapNeedsFit&&bounds.length)window.__siteMap.fitBounds(bounds,{padding:[20,20],maxZoom:10});
      state.mapNeedsFit=false;state.focusSelectedHotspot=false;
    });
  }
  render=function(){
    shellReady=true;
    if(pendingHash){const p=pendingHash;pendingHash=null;els.reports.innerHTML='<p class="empty" role="status">Loading night records…</p>';setMode('night',{hash:p});return}
    if(!active()){original.render();return}
    syncControls();const rows=filteredSites();
    const n=rows.reduce((sum,s)=>sum+(state.species?reporting(s)?.checklists||0:s.lists),0);
    els.summary.textContent=`${number(rows.length)} site${rows.length===1?'':'s'} shown · ${number(n)} night checklists${state.species?' reporting '+state.species:''}`;
    ordering.textContent=state.species?`Ordered by number of night checklists reporting ${state.species}`:'Ordered by number of nocturnal species recorded';
    els.reports.innerHTML=rows.map(siteHtml).join('')||'<p class="empty">No matching night records.</p>';
    renderMap(state.hotspot?hotspotMapSites():rows);renderSpeciesSuggestions();renderHotspotSuggestions();writeNightHash();
  };
  window.BirdFinderModes={setMode,get mode(){return mode},get busy(){return busy},get night(){return night},day};
  bootstrap();
})();
