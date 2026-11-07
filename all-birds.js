/* Day-only All Birds UI. Install after unified_cards.js and before night-mode.js. */
'use strict';
const allSpeciesScores = new Map();
function isAllBirds() { return document.body.dataset.mode !== 'night' && state.birdMode === 'all'; }
function speciesScoreName() { return isAllBirds() ? 'All species score' : 'Rare species score'; }
function siteScore(site) { return isAllBirds() ? allSpeciesScores.get(site.id)[0] : site.score; }
function siteScoreMonths(site) { return isAllBirds() ? allSpeciesScores.get(site.id).slice(1) : site.monthly; }
function scoreQualifies(value) { return isAllBirds() ? value > 20 : value >= 3.5; }
function allBirdsLegend() {
  return isAllBirds()
    ? [['<15', 'white'], ['15–20', '#1e3a8a'], ['20–25', 'yellow'], ['25–30', 'red'], ['30+', '#ff1493']]
    : [['<2', 'white'], ['2–3.5', '#1e3a8a'], ['3.5–5', 'yellow'], ['5+', 'red']];
}
async function loadAllSpeciesScores() {
  const data = await fetchJson('data/all-species-scores.json');
  if (data.version !== 1 || !data.scores) throw new Error('Invalid All Species Score data');
  for (const site of sites) {
    const values = data.scores[site.id];
    if (!Array.isArray(values) || values.length !== 13 || !values.every(x => Number.isFinite(x) && x >= 0)) {
      throw new Error(`Missing All Species Scores for ${site.id}`);
    }
    allSpeciesScores.set(site.id, values);
  }
}

(() => {
  const original = {initControls, syncControls, applyHashState, syncHash, monthScore, peakMonth,
    color, card, monthBars, renderReports, layoutSpeciesCallouts, toggleSiteDetails, speciesMonthChart};
  let modeControl;
  const INITIAL_ROWS = 5;
  const BATCH_ROWS = 8;
  const day = () => document.body.dataset.mode !== 'night';
  const batchKey = id => `${state.birdMode || 'rare'}:${id}`;
  function records() {
    state.cardBatches ||= {};
    state.cardShown ||= {};
    state.reportDisclosures ||= {};
  }
  function probability(sp, month) { return month && sp.monthly ? sp.monthly[month - 1] : sp.overallProb; }
  function mainRows(site, view, focal) {
    const all = isAllBirds();
    const rows = site.species.map(sp => ({sp, prob:probability(sp, view.month),
      contrib:view.month && sp.monthly ? sp.monthly[view.month - 1] * sp.rarity : sp.contribution,
      focal:!!focal && sp.name === focal.name}));
    const annual = row => all ? row.sp.overallProb : row.sp.contribution;
    const current = row => all ? row.prob : row.contrib;
    return rows.filter(row => row.focal || annual(row) >= .1 || current(row) >= .1)
      .sort((a,b) => Number(b.focal)-Number(a.focal) || Number(annual(b)>=.1)-Number(annual(a)>=.1)
        || annual(b)-annual(a) || a.sp.name.localeCompare(b.sp.name));
  }
  function supportRows(site, view) {
    const main = new Set(mainRows(site, view, view.speciesView?.sp).map(row => row.sp.name));
    return site.species.map(sp => ({sp, prob:probability(sp,view.month),
      contrib:probability(sp,view.month)*sp.rarity}))
      .filter(row => !main.has(row.sp.name) && (isAllBirds()
        ? row.prob < .1 : row.contrib >= .05 && row.contrib < .1))
      .sort((a,b) => b.prob-a.prob || a.sp.name.localeCompare(b.sp.name));
  }
  function supportingContent(site) {
    const rows = supportRows(site, siteDisplayView(site));
    const note = isAllBirds() ? 'includes all species with a probability less than 10%'
      : 'includes species with a rare species score contribution of at least 0.05';
    return `<div class="chip-wrap">${rows.map(row => `<span class="species-chip">${esc(row.sp.name)} <b>${fmtPct(row.prob)}</b></span>`).join('') || '<span class="empty">None.</span>'}</div><p class="section-foot">${note}</p>`;
  }
  function thresholdNote(view) {
    if (!isAllBirds()) return 'includes species with a rare species score contribution of at least 0.1';
    return view.month ? 'includes species with a probability of at least 10% in the selected month or All months'
      : 'includes species with a probability of at least 10%';
  }
  function columnCount(grid) {
    const columns = getComputedStyle(grid).gridTemplateColumns;
    return columns && columns !== 'none' ? Math.max(1,columns.split(/\s+/).length) : 1;
  }
  function restoreDisclosures(container) {
    container.querySelectorAll('details[data-species-key]').forEach(detail => {
      detail.open = !!state.reportDisclosures[detail.dataset.speciesKey];
    });
  }
  function fillGrid(article, {clicked=false}={}) {
    if (!day() || !article?.isConnected) return;
    const site = sites.find(s => s.id === article.dataset.reportId);
    const grid = article.querySelector('.species-grid');
    if (!site || !grid || !grid.clientWidth) return;
    records();
    const key = batchKey(site.id), view = siteDisplayView(site), rows = mainRows(site,view,view.speciesView?.sp);
    const target = Math.min(rows.length, Math.max(state.cardShown[key] || 0,
      (state.cardBatches[key] || INITIAL_ROWS) * columnCount(grid)));
    const oldCount = grid.children.length;
    if (target > oldCount) grid.insertAdjacentHTML('beforeend', rows.slice(oldCount,target).map(r => card(r,view.month,site)).join(''));
    state.cardShown[key] = target;
    // Restore only newly appended cards: resizing an open disclosure must not close it.
    Array.from(grid.children).slice(oldCount).forEach(restoreDisclosures);
    const button = article.querySelector('[data-load-more]');
    button.hidden = target >= rows.length;
    if (clicked && button.hidden) grid.children[oldCount]?.querySelector('summary')?.focus({preventScroll:true});
    article.querySelector('.load-status').textContent = clicked ? 'Additional species shown.' : '';
  }
  toggleSiteDetails = function(id) {
    if (day() && state.siteDetails[id]) {
      records();
      const key = batchKey(id);
      delete state.cardBatches[key];
      delete state.cardShown[key];
    }
    return original.toggleSiteDetails(id);
  };
  window.showMoreBirds = id => {
    records(); const key = batchKey(id);
    state.cardBatches[key] = (state.cardBatches[key] || INITIAL_ROWS) + BATCH_ROWS;
    fillGrid(els.reports.querySelector(`[data-report-id="${CSS.escape(id)}"]`), {clicked:true});
  };

  initControls = function() {
    original.initControls();
    records(); state.birdMode ||= 'rare';
    const grid = qs('.filter-grid');
    const speciesBlock = els.species.closest('.filter-block');
    const hotspotBlock = els.hotspot.closest('.filter-block');
    const choose = document.createElement('section');
    choose.className = 'toolbar choose-toolbar';
    const chooseGrid = document.createElement('div'); chooseGrid.className = 'choose-grid';
    chooseGrid.append(speciesBlock, hotspotBlock); choose.append(chooseGrid);
    grid.closest('.toolbar').after(choose);
    grid.classList.add('main-filter-grid');
    const block = document.createElement('div'); block.className = 'filter-block bird-mode-control';
    block.innerHTML = '<div class="control"><label for="birdMode">Mode</label><select id="birdMode"><option value="rare">Rare birds</option><option value="all">All birds</option></select></div>';
    grid.prepend(block); modeControl = block.querySelector('select');
    modeControl.addEventListener('change', () => {
      const drafts = {species:els.species.value,hotspot:els.hotspot.value};
      // A scoring change must not cancel a pending species/hotspot selection.
      state.birdMode = modeControl.value;
      if (thresholdOn()) state.threshold = isAllBirds() ? '20' : '3.5';
      // Keep the user's map viewport; markers and scores still refresh.
      render();
      els.species.value = drafts.species; els.hotspot.value = drafts.hotspot;
      if(typeof renderSpeciesSuggestions==='function')renderSpeciesSuggestions(); if(typeof renderHotspotSuggestions==='function')renderHotspotSuggestions();
    });
    els.reports.addEventListener('toggle', event => {
      if (!day() || !event.target.matches('details')) return;
      records(); const detail = event.target;
      if (detail.dataset.speciesKey) state.reportDisclosures[detail.dataset.speciesKey] = detail.open;
      if (detail.dataset.supportingSite) {
        state.reportDisclosures[`more:${detail.dataset.supportingSite}`] = detail.open;
        toggleMoreSpeciesLabel(detail);
        if (detail.open && !detail.dataset.loaded) {
          const site = sites.find(s => s.id === detail.dataset.supportingSite);
          detail.querySelector('.supporting-content').innerHTML = supportingContent(site);
          detail.dataset.loaded = 'true';
        }
      }
    }, true);
    els.reports.addEventListener('click', event => {
      const name = event.target.closest('[data-sticky-name]');
      if (!day() || !name) return;
      const full = name.closest('.report-sticky').querySelector('.sticky-full-name');
      full.hidden = !full.hidden; name.setAttribute('aria-expanded',String(!full.hidden));
    });
  };
  applyHashState = function() {
    original.applyHashState();
    const p = new URLSearchParams(location.hash.slice(1));
    state.birdMode = p.get('birds') === 'all' ? 'all' : 'rare';
    if (state.threshold !== 'off') state.threshold = isAllBirds() ? '20' : '3.5';
  };
  syncHash = function() {
    original.syncHash(); if (!state.hashReady) return;
    const p = new URLSearchParams(location.hash.slice(1));
    if (isAllBirds()) p.set('birds','all'); else p.delete('birds');
    history.replaceState(null,'',`${location.pathname}${location.search}#${p}`);
  };
  syncControls = function() {
    original.syncControls();
    if (!modeControl) return;
    modeControl.closest('.filter-block').classList.toggle('hidden',!day());
    modeControl.value = state.birdMode || 'rare';
    document.body.dataset.birds = isAllBirds() ? 'all' : 'rare';
    if (day() && thresholdOn()) state.threshold = isAllBirds() ? '20' : '3.5';
    const note = els.threshold.closest('.best-hotspots').querySelector('.best-hotspots-note');
    if (note && day()) note.textContent = isAllBirds() ? '(more than 20)' : '(more than 3.5)';
  };
  monthScore = (site,month) => isAllBirds() ? siteScoreMonths(site)[month-1] : original.monthScore(site,month);
  peakMonth = function(site) {
    if (!isAllBirds()) return original.peakMonth(site);
    const values=siteScoreMonths(site);
    if (Math.max(...values)-Math.min(...values)<1e-12) return null;
    return values.indexOf(Math.max(...values))+1;
  };
  color = value => !isAllBirds() ? original.color(value)
    : value >= 30 ? '#ff1493' : value >= 25 ? 'red' : value >= 20 ? 'yellow' : value >= 15 ? '#1e3a8a' : 'white';
  monthBars = (site,month) => original.monthBars(isAllBirds()
    ? {...site,score:siteScore(site),monthly:siteScoreMonths(site),hasSeasonality:true} : site, month);

  occurrenceLabel = function(sp) {
    if (!(sp.flags || []).some(f => f === 'one off' || f === 'one off occurrence')) return '';
    if (!Array.isArray(sp.recordedDates) || sp.recordedDates.length !== 2) return 'One off occurrence';
    const [a,b]=sp.recordedDates.map(s => String(s).split('-').map(Number));
    if (![a,b].every(d => d.length===3 && d.every(Number.isFinite) && d[1]>=1 && d[1]<=12)) return 'One off occurrence';
    if (a[0]===b[0] && a[1]===b[1]) return `One off occurrence: ${MONTHS[a[1]-1]} ${a[0]}`;
    if (a[0]===b[0]) return `One off occurrence: ${MONTHS[a[1]-1]}–${MONTHS[b[1]-1]} ${a[0]}`;
    return `One off occurrence: ${MONTHS[a[1]-1]} ${a[0]}–${MONTHS[b[1]-1]} ${b[0]}`;
  };
  card = function(row,month,site) {
    const html = original.card(row,month,site).replace(/(?<!rare species )score contribution/g,'rare species score contribution').replace('<small>All months</small>','');
    if (!isAllBirds()) return html;
    const template = document.createElement('template'); template.innerHTML = html;
    const article = template.content.firstElementChild;
    const details = article.querySelector('details');
    article.classList.add('all-birds-card');
    article.querySelector('.detail-row')?.remove();
    if (details) details.querySelector('summary').textContent = 'Photo credit';
    return article.outerHTML;
  };

  let nameMeasureContext;
  function layoutAdaptiveSpeciesName(article) {
    if (!day() || !article.clientWidth) return;
    const top=article.querySelector('.species-top'),name=article.querySelector('.species-name'),prob=article.querySelector('.probability');
    if (!top || !name || !prob) return;
    article.classList.remove('name-fallback','name-full-width');name.style.paddingBottom='';
    nameMeasureContext ||= document.createElement('canvas').getContext('2d');
    const style=getComputedStyle(name);
    nameMeasureContext.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const tracking=parseFloat(style.letterSpacing)||0;
    const words=name.textContent.split(/[\s/\-–()]+/).filter(Boolean);
    const widest=Math.max(0,...words.map(word=>nameMeasureContext.measureText(word).width+tracking*(word.length-1)));
    if (widest>name.clientWidth+.25) {
      article.classList.add('name-fallback');
      if (widest>name.clientWidth+.25) article.classList.add('name-full-width');
      else name.style.paddingBottom=(prob.getBoundingClientRect().height+4)+'px';
    }
  }
  layoutSpeciesCallouts = function(article) {
    layoutAdaptiveSpeciesName(article);
    original.layoutSpeciesCallouts(article);
  };

  // All months shares the probability/score scale with the twelve months.
  speciesMonthChart = function(sp,month,site) {
    if (!Array.isArray(sp.monthly) || sp.monthly.length!==12) return original.speciesMonthChart(sp,month,site);
    const values=sp.monthly,all=sp.overallProb,peak=Math.max(all,...values,.01);
    return `<div class="species-season"><div class="species-months has-all-months" style="--all-ratio:${all/peak}" role="group" aria-label="Monthly probability and All months; select a month to change this hotspot view"><span class="all-months-reference" aria-hidden="true"></span>${[...values,all].map((p,i)=>{
      const annual=i===12,selected=annual?!month:month===i+1,label=annual?'All months':MONTH_FULL[i];
      return `<button type="button" class="species-month ${annual?'all-months-column ':''}${selected?'active':''}" data-month="${annual?0:i+1}" aria-pressed="${selected}" aria-label="${label}: ${fmtPct(p)}. ${annual||selected?'Show hotspot for All months':`Show hotspot in ${label}`}" onclick="${annual?'selectAllSpeciesMonths(this)':`selectSpeciesMonth(this,${i+1})`}"><span class="species-month-tip" role="tooltip">${label} · ${fmtPct(p)}</span><span class="species-month-track"><span class="species-month-fill" style="--height:${p/peak*100}%"></span></span><span class="species-month-label">${annual?'All':MONTHS[i][0]}</span></button>`;
    }).join('')}</div></div>`;
  };
  window.selectAllSpeciesMonths = function(button) {
    const article=button.closest('article[data-species-key]');if(!article)return;
    const key=article.dataset.speciesKey;resetSiteMonth(article.dataset.siteId);
    Array.from(els.reports.querySelectorAll('article[data-species-key]')).find(a=>a.dataset.speciesKey===key)?.querySelector('.all-months-column')?.focus({preventScroll:true});
  };

  function monthChip(site,view) {
    return `<select class="report-month" aria-label="Hotspot month for ${esc(site.name)}" onchange="setSiteView('${site.id}',this.value)">${siteViewOptions(view)}</select>`;
  }
  function headerMonthlyProfile(site,view) {
    const values=siteScoreMonths(site);if(!Array.isArray(values)||values.length!==12)return '';
    const all=siteScore(site),peak=Math.max(all,...values,.01);
    return `<div class="header-monthly-profile" style="--all-ratio:${all/peak}" role="group" aria-label="Monthly ${speciesScoreName().toLowerCase()} and All months for ${esc(site.name)}"><span class="all-months-reference" aria-hidden="true"></span>${[...values,all].map((value,i)=>{
      const annual=i===12,selected=annual?!view.month:view.month===i+1,label=annual?'All months':MONTH_FULL[i];
      return `<button class="header-month-column ${annual?'all-months-column ':''}${selected?'active':''}" type="button" aria-pressed="${selected}" aria-label="${label}: ${fmtScore(value)}. ${annual||selected?'Show hotspot in All months':`Show hotspot in ${label}`}" onclick="${annual||selected?'resetSiteMonth':'setSiteMonth'}('${site.id}'${annual||selected?'':`,${i+1}`})"><span class="header-month-tip" role="tooltip">${label} · ${fmtScore(value)}</span><span class="header-month-track"><span class="header-month-fill" style="height:${value/peak*100}%"></span></span><span class="header-month-letter">${annual?'All':MONTHS[i][0]}</span></button>`;
    }).join('')}</div>`;
  }
  function identity(site,view,rank,{sticky=false}={}) {
    const name = esc(site.name);
    return `<div class="report-identity">${sticky?'':`<button class="report-collapse-arrow" type="button" aria-expanded="${!!state.siteDetails[site.id]}" aria-label="${state.siteDetails[site.id]?'Collapse':'Expand'} ${esc(site.name)}" onclick="toggleSiteDetails('${site.id}')"><span aria-hidden="true">${state.siteDetails[site.id]?'↑':'↓'}</span></button>`}<h2 class="report-name">${sticky
      ? `<button type="button" data-sticky-name aria-expanded="false" title="${esc(site.name)}">${name}</button>` : name}</h2>${monthChip(site,view)}</div>`;
  }
  function header(site,view,rank,open) {
    const score = `<strong>${fmtScore(view.score)}</strong><span>${speciesScoreName()}</span>`;
    const svg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    return `<header class="day-report-header"><button class="header-toggle-hit" type="button" aria-expanded="${open}" aria-label="${open?'Collapse':'Expand'} ${esc(site.name)}" onclick="toggleSiteDetails('${site.id}')"></button>${identity(site,view,rank)}<div class="report-secondary">${open
      ? `<div class="site-meta"><span>${esc(site.region)}</span><a href="https://ebird.org/hotspot/${site.id}" target="_blank" rel="noopener noreferrer">eBird link</a></div>`
      : `<div class="report-inline-score">${score}</div>`}</div>${open
      ? `<div class="report-metric-row"><div class="report-metrics metric-stack"><div class="metric"><strong>${view.checklists.toLocaleString()}</strong><span>${esc(view.checklistLabel)}</span></div><button class="metric location-chip" type="button" onclick="showSingleHotspot('${site.id}')">${svg}<span>see location</span></button><div class="metric">${score}</div></div>${headerMonthlyProfile(site,view)}</div><div class="site-action-row">${state.hotspot?'<button class="btn site-location-action clear-hotspot-action" type="button" onclick="clearHotspot()">Clear hotspot</button>':''}${state.species?'<button class="btn site-location-action clear-hotspot-action" type="button" onclick="clearSpecies()">Clear species</button>':''}</div>` : ''}</header>`;
  }
  siteHtml = function(site,rank) {
    records(); const view = siteDisplayView(site), open = !!state.siteDetails[site.id];
    if (!open) return `<article class="site-card day-report" data-report-id="${site.id}">${header(site,view,rank,false)}</article>`;
    const rows = mainRows(site,view,view.speciesView?.sp), key = batchKey(site.id);
    const count = Math.min(rows.length,state.cardShown[key] || INITIAL_ROWS);
    const moreOpen = state.reportDisclosures[`more:${site.id}`];
    return `<article class="site-card site-card-open day-report day-report-open" data-report-id="${site.id}"><div class="report-sticky" aria-hidden="true">${identity(site,view,rank,{sticky:true})}<div class="sticky-full-name" hidden>${esc(site.name)}</div></div>${header(site,view,rank,true)}<div class="day-report-body"><section class="section">${site.flags?.length?`<div class="badges hotspot-warnings">${site.flags.map(f=>`<span class="badge badge-orange">${esc(f)}</span>`).join('')}</div>`:''}<div class="species-grid">${rows.slice(0,count).map(row=>card(row,view.month,site)).join('')}</div><p class="section-foot">${thresholdNote(view)}</p><button class="btn show-more-species" type="button" data-load-more onclick="showMoreBirds('${site.id}')" ${count>=rows.length?'hidden':''}>Show more ↓</button><span class="load-status" role="status" aria-live="polite"></span></section></div><section class="section supporting-section"><details class="supporting" data-supporting-site="${site.id}" ${moreOpen?'open data-loaded="true"':''}><summary><span class="more-species-label">More species - ${moreOpen?'hide':'show'}</span></summary><div class="supporting-content">${moreOpen?supportingContent(site):''}</div></details></section></article>`;
  };

  let gridObserver, headerObserver;
  function watchReports() {
    gridObserver?.disconnect(); headerObserver?.disconnect();
    gridObserver = new ResizeObserver(entries => entries.forEach(entry => fillGrid(entry.target.closest('.day-report'))));
    headerObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      const article=entry.target.closest('.day-report'), sticky=article.querySelector('.report-sticky');
      const stuck=entry.boundingClientRect.bottom<=0;
      sticky.classList.toggle('is-stuck',stuck);sticky.setAttribute('aria-hidden',String(!stuck));
      sticky.inert=!stuck;
    }), {threshold:[0,1]});
    els.reports.querySelectorAll('.day-report-open').forEach(article => {
      const sticky=article.querySelector('.report-sticky');sticky.inert=true;
      headerObserver.observe(article.querySelector('.day-report-header .report-identity'));
      gridObserver.observe(article.querySelector('.species-grid'));
      fillGrid(article);
    });
  }
  renderReports = function(rows) {
    records();
    els.reports.querySelectorAll('details[data-species-key]').forEach(d => {state.reportDisclosures[d.dataset.speciesKey]=d.open;});
    els.reports.innerHTML = rows.map((site,i)=>siteHtml(site,i+1)).join('') || '<p class="empty">No matching sites.</p>';
    restoreDisclosures(els.reports); watchReports();
  };
})();
