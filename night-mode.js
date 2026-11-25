/* Descriptive night records, integrated into the existing report shell. */
(() => {
  'use strict';
  const original = {initControls, applyHashState, render, syncControls, baseFilteredSites,
    ensureSiteDetails, ensureSpecies, selectSpecies, selectHotspot, showSingleHotspot,
    toggleSiteDetails, renderSpeciesSuggestions, renderHotspotSuggestions, renderMapStable};
  const day = {state, speciesNames, sites:null, viewport:null, details:[], scroll:0};
  let mode='day', night=null, loading=null, change=0, busy=false, pendingHash=null, shellReady=false;
  const pendingDay=new Set();
  let mapOwner='day';
  const number=n=>Number(n).toLocaleString('en-AU');
  const date=s=>new Date(s+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  const active=()=>mode==='night';
  const nocturnalCount=s=>s.species.filter(p=>night.preset.has(p.name)).length;
  const reporting=s=>s.species.find(p=>p.name===state.species);
  let modePanel, message, ordering;

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
    view.inputDrafts={species:els.species.value,hotspot:els.hotspot.value};
    if(window.__siteMap&&mapOwner===mode){const center=window.__siteMap.getCenter();view.viewport={center:[center.lat,center.lng],zoom:window.__siteMap.getZoom()}}
    if(!active())view.details=Array.from(els.reports.querySelectorAll('.site-card')).flatMap(article=>Array.from(article.querySelectorAll('details'),(d,index)=>({id:article.querySelector('[data-site-id]')?.dataset.siteId||article.querySelector('.site-title')?.textContent||article.querySelector('.site-collapse-title')?.textContent,index,open:d.open})));
  }
  function restoreViewport(view){
    if(view.restoreViewport&&view.viewport&&window.__siteMap){window.__siteMap.setView(view.viewport.center,view.viewport.zoom,{animate:false})}
    view.restoreViewport=false;
  }
  function restoreDayDetails(){
    els.reports.querySelectorAll('.site-card').forEach(article=>{
      const id=article.querySelector('[data-site-id]')?.dataset.siteId||article.querySelector('.site-title')?.textContent||article.querySelector('.site-collapse-title')?.textContent;
      article.querySelectorAll('details').forEach((d,index)=>{const prior=day.details.find(x=>x.id===id&&x.index===index);if(prior)d.open=prior.open});
    });
  }
  async function setMode(next,{hash=null,birdMode=null}={}){
    if(!['day','night'].includes(next))throw new Error('Unknown mode');
    const token=++change;
    if(next===mode&&!busy)return;
    busy=true;syncModeButtons();
    message.classList.add('hidden');
    try{
      if(next==='night')await loadNight();
      // Include actions begun while a switch is waiting, not just those already
      // pending when it was requested. No asynchronous day handler may outlive
      // the state-reference swap.
      do{
        await Promise.allSettled([...pendingDay]);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      }while(pendingDay.size&&token===change);
      if(token!==change)return;
      if(typeof clearLoadMessage==='function')clearLoadMessage();
      capture(active()?night:day);
      const {infoOpen,technicalInfoOpen}=state;
      mode=next;
      if(active()){
        if(hash)readNightHash(hash);
        state=night.state;sites=night.sites;speciesNames=night.data.species;
      }else{state=day.state;sites=day.sites;speciesNames=day.speciesNames;
        if(birdMode)state.birdMode=birdMode;
      }
      Object.assign(state,{infoOpen,technicalInfoOpen});
      document.body.dataset.mode=mode;
      const view=active()?night:day;
      view.restoreViewport=!!view.viewport&&!state.mapNeedsFit;
      els.reports.replaceChildren();
      els.speciesSuggestions.classList.add('hidden');els.hotspotSuggestions.classList.add('hidden');
      render();
      if(!active())restoreDayDetails();
      if(view.inputDrafts){els.species.value=view.inputDrafts.species;els.hotspot.value=view.inputDrafts.hotspot}
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(token!==change)return;
        window.scrollTo(0,view.scroll||0);
      }));
    }catch(error){
      console.error('Night mode could not be loaded',error);
      message.textContent='Night records could not be loaded. Use the mode button to try again.';
      message.classList.remove('hidden');
      if(!active()&&!els.reports.querySelector('.site-card')){
        const drafts={species:els.species.value,hotspot:els.hotspot.value};
        original.render();els.species.value=drafts.species;els.hotspot.value=drafts.hotspot;
      }
    }finally{if(token===change){busy=false;syncModeButtons()}}
  }
  const modeLabels={all:'All Birds Mode',rare:'Rare Birds Mode',night:'Night Birds Mode'};
  function syncModeButtons(){
    if(!modePanel)return;
    const selected=active()?'night':state.birdMode||'rare';
    for(const button of modePanel.querySelectorAll('[data-bird-mode]')){
      button.disabled=busy||!shellReady;
      button.setAttribute('aria-pressed',String(button.dataset.birdMode===selected));
    }
    modePanel.setAttribute('aria-busy',String(busy));
    const description=modePanel.querySelector('.bird-mode-description');
    const text='Placeholder text explaining '+modeLabels[selected]+' will appear here.';
    if(description.textContent!==text)description.textContent=text;
  }

  initControls=function(){
    original.initControls();day.sites=sites;
    modePanel=document.createElement('section');
    modePanel.className='bird-mode-panel';
    const icons={
      all:'<img class="bird-mode-magpie" src="images/magpie-mode.png" alt="">',
      rare:`<svg class="bird-mode-binoculars" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 14.5 4.5 6.7A2.5 2.5 0 0 1 6.9 5h.6A2.5 2.5 0 0 1 10 7.5V16m12-1.5-2.5-7.8A2.5 2.5 0 0 0 17.1 5h-.6A2.5 2.5 0 0 0 14 7.5V16M10 9h4m-4 4h4"/>
        <circle cx="6" cy="16" r="4"/>
        <circle cx="18" cy="16" r="4"/>
      </svg>`,
      night:'<span class="bird-mode-moon" aria-hidden="true">☾</span>'
    };
    const buttons=document.createElement('div');
    buttons.className='bird-mode-buttons';
    buttons.setAttribute('role','group');
    buttons.setAttribute('aria-label','Bird Finder mode');
    for(const [choice,label] of Object.entries(modeLabels)){
      const button=document.createElement('button');
      button.type='button';
      button.dataset.birdMode=choice;
      button.innerHTML=icons[choice];
      const title=document.createElement('span');
      title.textContent=label;
      button.append(title);
      button.addEventListener('click',async()=>{
        if(choice==='night')await setMode('night');
        else if(active())await setMode('day',{birdMode:choice});
        else window.selectDayBirdMode(choice);
        if(document.activeElement===document.body)button.focus({preventScroll:true});
      });
      buttons.append(button);
    }
    const description=document.createElement('p');
    description.className='bird-mode-description';
    description.setAttribute('role','status');
    modePanel.append(buttons,description);
    els.technicalInfoCard.after(modePanel);
    message=document.createElement('p');message.className='night-load-message hidden';message.setAttribute('role','status');modePanel.after(message);
    syncModeButtons();
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
    original.syncControls();syncModeButtons();
    els.species.placeholder=active()?'Choose a nocturnal species or type any species':'Start typing a species';
    els.sort.closest('.filter-block').classList.toggle('hidden',active());
    els.threshold.closest('.best-hotspots-row').classList.toggle('hidden',active());
    qs('.filter-grid').classList.toggle('night-filter-grid',active());
    ordering?.classList.toggle('hidden',!active());
    if(active()){els.monthControl.classList.add('hidden');els.resetSiteViews.classList.add('hidden')}
  };
  renderSpeciesSuggestions=function(){
    if(!active())return original.renderSpeciesSuggestions();
    const norm=s=>s.trim().toLowerCase().replace(/grey/g,'gray').replace(/[\s\u002d\u2010-\u2015]+/g,'');
    const q=norm(els.species.value);
    if(document.activeElement!==els.species){els.speciesSuggestions.classList.add('hidden');return}
    const browse=!q||q===norm(state.species);
    const matches=browse?night.data.nocturnalSpecies:night.data.species.filter(s=>norm(s).includes(q)).slice(0,8);
    if(!matches.length){els.speciesSuggestions.classList.add('hidden');return}
    els.speciesSuggestions.innerHTML=matches.map(s=>`<button class="suggestion" type="button" data-species="${esc(s)}">${esc(s)}</button>`).join('');
    els.speciesSuggestions.classList.remove('hidden');
    els.speciesSuggestions.querySelectorAll('[data-species]').forEach(btn=>btn.addEventListener('click',()=>selectSpecies(btn.dataset.species)));
  };
  ensureSiteDetails=async function(id){if(!active())return original.ensureSiteDetails(id)};
  ensureSpecies=async function(name){if(!active())return original.ensureSpecies(name)};
  renderMapStable=function(rows){
    if(active())return;
    if(state.mapNeedsFit)day.restoreViewport=false;
    const currentState=state;original.renderMapStable(rows);
    if(state.mapOpen)requestAnimationFrame(()=>{
      if(!active()&&state===currentState&&window.__siteMap){mapOwner='day';restoreViewport(day)}
    });
  };
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
    return `<article class="species-card ${state.species===sp.name?'species-card-focal':''}"><div class="species-top ${image?'has-photo':''}">${photo}<div class="species-name">${esc(sp.name)}</div><div class="probability">${number(sp.checklists)}<small>${sp.checklists===1?'checklist':'checklists'}</small></div></div><details data-night-species="${esc(key)}" ${state.speciesOpen[key]?'open':''}><summary>More details</summary><div class="detail-row night-date"><span><b>${date(sp.last)}</b> latest record</span></div>${credit}</details></article>`;
  }
  function siteHtml(site){
    const open=!!state.siteDetails[site.id],count=nocturnalCount(site),focal=reporting(site);
    const metrics=`<div class="night-total metric"><strong>${number(site.lists)}</strong><span>Night checklists total</span></div><div class="night-count">${focal?`<strong>${number(focal.checklists)}</strong> checklists<br>reporting ${esc(focal.name)}`:`<strong>${count}</strong> nocturnal<br>species recorded`}</div>`;
    if(!open)return `<article class="site-card site-card-collapsed"><button class="site-collapse-head night-head" type="button" onclick="toggleSiteDetails('${site.id}')"><div><h2 class="site-collapse-title">${esc(site.name)}</h2><div class="site-collapse-meta">${esc(site.region)}</div></div>${metrics}<span class="site-collapse-prompt">Show details ↓</span></button></article>`;
    const main=site.species.filter(p=>night.preset.has(p.name)),other=site.species.filter(p=>!night.preset.has(p.name));
    const otherExpanded=state.otherOpen[site.id]??other.some(p=>p.name===state.species);
    return `<article class="site-card site-card-open"><header class="site-header night-header"><div class="site-title-toggle" role="button" tabindex="0" aria-label="Collapse ${esc(site.name)}" onclick="if(!event.target.closest('a,button'))toggleSiteDetails('${site.id}')" onkeydown="if((event.key==='Enter'||event.key===' ')&&!event.target.closest('a,button')){event.preventDefault();toggleSiteDetails('${site.id}')}"><h1 class="site-title">${esc(site.name)}</h1><div class="site-meta"><span>${esc(site.region)}</span><a href="https://ebird.org/hotspot/${site.id}" target="_blank" rel="noopener noreferrer">eBird link</a></div></div><div class="site-header-side"><button class="site-hide-details" type="button" onclick="toggleSiteDetails('${site.id}')">Hide details ↑</button><div class="site-action-row">${state.hotspot?`<button class="btn site-location-action clear-hotspot-action" type="button" onclick="clearHotspot()">Clear hotspot</button>`:`<button class="btn site-location-action" type="button" onclick="showSingleHotspot('${site.id}')">See hotspot location</button>`}${state.species?`<button class="btn site-location-action clear-hotspot-action" type="button" onclick="clearSpecies()">Clear species</button>`:''}</div><div class="night-metrics">${metrics}</div></div></header><section class="section"><p class="section-note">Ordered by number of night checklists reporting each species</p>${main.length?`<div class="species-grid">${main.map(p=>speciesCard(p,site)).join('')}</div>`:'<p class="empty">No species from the nocturnal preset recorded on these checklists.</p>'}${other.length?`<details class="supporting night-other" data-night-other="${site.id}" ${otherExpanded?'open':''}><summary><span class="more-species-label">More species - ${otherExpanded?'hide':'show'}</span><span>${other.length} other species</span></summary><div class="chip-wrap">${other.map(p=>`<span class="species-chip ${state.species===p.name?'night-focal':''}">${esc(p.name)} <b>${number(p.checklists)} ${p.checklists===1?'checklist':'checklists'}</b></span>`).join('')}</div></details>`:''}</section></article>`;
  }
  function renderMap(rows){
    if(state.mapNeedsFit)night.restoreViewport=false;
    const selectedSpecies=!!state.species;
    const bands=selectedSpecies?[[1,'1–2','#1e3a8a'],[3,'3–5','yellow'],[6,'6+','red']]:[[0,'0','white'],[1,'1–2','#1e3a8a'],[3,'3–5','yellow'],[6,'6+','red']];
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
        const n=selectedSpecies?reporting(site)?.checklists||0:nocturnalCount(site),color=n>=6?'red':n>=3?'yellow':n>=1?'#1e3a8a':'white';
        L.circleMarker([site.y,site.x],{radius:6,color:color==='white'?'#111':color,weight:2,fill:true,fillColor:color,fillOpacity:.9}).addTo(window.__siteMarkerLayer).bindTooltip(`${esc(site.name)} - ${number(n)} ${selectedSpecies?'reporting checklists':'nocturnal species'}`).on('click',()=>{selectHotspot(site,{fromMap:true});els.reports.scrollIntoView({behavior:'smooth',block:'start'})});bounds.push([site.y,site.x]);
      });
      const selected=state.hotspot?rows.find(s=>s.id===state.selectedSite):null;
      if(selected)L.circleMarker([selected.y,selected.x],{radius:11,color:'black',weight:3,opacity:1,fill:false,interactive:false}).addTo(window.__siteSelectionLayer);
      window.__siteMap.invalidateSize({pan:false});
      if(selected&&state.focusSelectedHotspot)window.__siteMap.setView([selected.y,selected.x],10);
      else if(state.mapNeedsFit&&bounds.length)window.__siteMap.fitBounds(bounds,{padding:[20,20],maxZoom:10});
      mapOwner='night';restoreViewport(night);
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
