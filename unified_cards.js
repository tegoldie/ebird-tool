/* Approved compact cards. Interval is conditional on the retained seasonal shape. */
function probabilityInterval(sp,month,prob){
  const bounds=month?sp.monthlyIntervals?.[month-1]:sp.interval;
  if(!Array.isArray(bounds)||bounds.length!==2||!bounds.every(Number.isFinite))return '';
  const [lo,hi]=bounds;const label=`80% confidence interval: ${fmtPct(lo)} to ${fmtPct(hi)}. Expected probability ${fmtPct(prob)}. Conditional on the seasonal pattern.`;
  return `<div class="prob-interval" role="img" aria-label="${esc(label)}" title="${esc(label)}"><div class="interval-limits" data-low="${lo}" data-high="${hi}"><span>${fmtPct(lo)}</span><span>${fmtPct(hi)}</span></div><div class="interval-rail"><span class="interval-band" style="left:${lo*100}%;width:${(hi-lo)*100}%"></span><span class="interval-end" style="left:${lo*100}%"></span><span class="interval-end" style="left:${hi*100}%"></span><span class="interval-dot" style="left:${prob*100}%"></span></div><div class="interval-caption">80% confidence interval</div></div>`;
}
function layoutIntervalLabels(card){
  const row=card.querySelector('.interval-limits');if(!row||!row.clientWidth)return;
  const labels=row.querySelectorAll('span'),width=row.clientWidth;
  const halfA=labels[0].getBoundingClientRect().width/2,halfB=labels[1].getBoundingClientRect().width/2;
  let a=Math.max(halfA,Math.min(width-halfA,width*Number(row.dataset.low)));
  let b=Math.max(halfB,Math.min(width-halfB,width*Number(row.dataset.high)));
  const minimum=halfA+halfB+6;
  if(b-a<minimum){const middle=(a+b)/2;a=middle-minimum/2;b=middle+minimum/2;
    if(a<halfA){b+=halfA-a;a=halfA;}
    if(b>width-halfB){a-=b-(width-halfB);b=width-halfB;}
  }
  labels[0].style.left=`${a}px`;labels[1].style.left=`${b}px`;
}
// Measure actual text: callouts share the chart width until one needs extra room.
function layoutSpeciesCallouts(card){
  layoutIntervalLabels(card);
  const caption=card.querySelector('.interval-caption'),side=card.querySelector('.species-main'),season=card.querySelector('.species-months');
  if(caption&&side&&season)caption.style.maxWidth=`${Math.max(0,side.getBoundingClientRect().width-season.getBoundingClientRect().width-8)}px`;
  const boxes=Array.from(card.querySelectorAll('.species-callout'));
  const chart=card.querySelector('.species-months'),main=card.querySelector('.species-main');
  if(!boxes.length||!chart||!main||!card.getBoundingClientRect().width)return;
  const chartWidth=chart.getBoundingClientRect().width,available=main.getBoundingClientRect().width;
  let required=0;
  for(const box of boxes){
    box.style.fontSize='';
    const range=document.createRange();range.selectNodeContents(box);
    const style=getComputedStyle(box);
    required=Math.max(required,range.getBoundingClientRect().width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+parseFloat(style.borderLeftWidth)+parseFloat(style.borderRightWidth));
  }
  const width=Math.min(available,Math.max(chartWidth,Math.ceil(required)));
  for(const box of boxes){
    box.style.width=`${width}px`;
    if(required>available)box.style.fontSize=`${11*(available-2)/required}px`;
  }
  const seasonal=card.querySelector('.seasonal-callout'),anchor=card.querySelector('.seasonal-anchor');
  if(seasonal&&anchor){
    if(width>chartWidth+.5){if(seasonal.parentElement!==card)main.after(seasonal);}
    else if(seasonal.parentElement!==anchor.parentElement)anchor.after(seasonal);
  }
}
(()=>{
  const root=document.getElementById('reports');if(!root)return;
  const watched=new Set(),resize=new ResizeObserver(entries=>entries.forEach(entry=>layoutSpeciesCallouts(entry.target)));
  function scan(){
    for(const card of watched)if(!card.isConnected){resize.unobserve(card);watched.delete(card);}
    for(const card of root.querySelectorAll('.unified-card'))if(!watched.has(card)){watched.add(card);resize.observe(card);layoutSpeciesCallouts(card);}
  }
  new MutationObserver(scan).observe(root,{childList:true,subtree:true});scan();
  document.fonts?.ready.then(()=>watched.forEach(layoutSpeciesCallouts));
})();
function occurrenceLabel(sp){
  if(!(sp.flags||[]).some(f=>f==='one off'||f==='one off occurrence'))return '';
  const dates=sp.recordedDates;
  if(!Array.isArray(dates)||dates.length!==2)return 'One off occurrence';
  const [a,b]=dates.map(s=>s.split('-').map(Number));
  if(a[0]===b[0]&&a[1]===b[1])return `Recorded only in ${MONTHS[a[1]-1]} ${a[0]}`;
  if(a[0]===b[0])return `Recorded only in ${MONTHS[a[1]-1]}–${MONTHS[b[1]-1]} ${a[0]}`;
  return `Recorded only in ${MONTHS[a[1]-1]} ${a[0]}–${MONTHS[b[1]-1]} ${b[0]}`;
}
function card(r,month,site){
  const sp=r.sp,image=speciesImages[sp.name],oneOff=occurrenceLabel(sp);
  const warning=!oneOff&&(sp.flags||[]).includes('seasonal pattern uncertain');
  const photo=image?`<a class="species-photo-link" href="${esc(image.source)}" target="_blank" rel="noopener noreferrer"><img class="species-photo" src="${image.src}" alt="${esc(sp.name)}" loading="lazy" decoding="async"></a>`:'';
  const credit=image?`<span class="photo-credit">Photo: ${image.author||'Wikimedia Commons contributor'} · <a href="${esc(image.source)}" target="_blank" rel="noopener noreferrer">${esc(image.license||'Wikimedia Commons')}</a> · cropped</span>`:'';
  const interval=probabilityInterval(sp,month,r.prob),chart=speciesMonthChart(sp,month,site);
  const key=esc(JSON.stringify([site.id,sp.name]));
  return `<article class="species-card unified-card ${r.focal?'species-card-focal':''}" data-site-id="${esc(site.id)}" data-species-key="${key}"><div class="species-top ${image?'has-photo':''}">${photo}<div class="species-name">${esc(sp.name)}</div><div class="probability">${fmtPct(r.prob)}${month?'':'<small>All months</small>'}</div></div><div class="species-main ${interval?'has-interval':''}"><div class="species-chart-column">${chart}<span class="seasonal-anchor" hidden></span>${warning?'<div class="species-callout seasonal-callout">Seasonal pattern uncertain</div>':''}</div>${interval}</div>${oneOff?`<div class="species-callout occurrence-callout ${interval?'with-interval':''}">${esc(oneOff)}</div>`:''}<details data-site-id="${esc(site.id)}" data-species-key="${key}"><summary>More details</summary><div class="detail-row detail-row-compact"><span><b>${fmtSpeciesScore(r.contrib)}</b> ${month?`score contribution in ${MONTHS[month-1]}`:'score contribution'}</span><span><b>${fmtSpeciesScore(sp.rarity)}</b> rarity weight</span></div>${credit}</details></article>`;
}
