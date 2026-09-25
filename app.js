  // Pontos cumulativos transcritos do registro de 24/02/2020. Cada porcentagem
  // refere-se ao progresso dentro do skill exibido, não à fração de 0 a 100.
  const recipes={
    b:{name:'Item Finder B',min:60,batch:10,minutes:100,points:[[0,60,68.20],[24,71,40.19],[32,72,81.83],[38,73,67.65],[50,75,9.81],[63,76,29.95],[85,77,90.83],[125,80,0.40]],source:'https://wiki.pokexgames.com/Craft_de_Profiss%C3%B5es'},
    a:{name:'Item Finder A',min:80,batch:10,minutes:180,points:[[0,80,0.40],[99,95,43.57],[128,96,81.03],[182,98,70.51],[222,99,79.26],[232,100,4.40]],source:'https://wiki.pokexgames.com/Craft_de_Profiss%C3%B5es'},
    c:{name:'Item Finder C',min:40,batch:10,minutes:30,points:[[0,40,54.78],[13,52,21.08],[20,54,37.89],[40,58,5.61],[55,59,77.24],[65,60,68.20]],source:'https://wiki.pokexgames.com/Craft_de_Profiss%C3%B5es'},
    d:{name:'Item Finder D',min:20,batch:10,minutes:15,points:[[0,25,48.81],[12,33,7.76],[42,38,98.34],[57,40,54.78]],source:'https://wiki.pokexgames.com/Craft_de_Profiss%C3%B5es'},
    e:{name:'Item Finder E',min:0,batch:null,minutes:null,points:[[0,20,74.29],[10,23,33.90]],source:null},
    lock:{name:'Lockpick',min:0,batch:null,minutes:null,segments:[[[0,0,0],[200,20,74.29]],[[0,23,33.90],[100,24,87.14],[150,25,48.81]]],source:null}
  };
  // Cada Diamond Dust acelera 14 minutos do tempo total de craft.
  // Fonte: https://rafa-tolomeotti.wixsite.com/pxgwiki/proffisso
  // Integer-level exponential fit; reproduce with analysis/compare_models.py.
  const progressionModels = {
  "d": {
    "a": 4.223625358168606,
    "k": 0.1773116822211595
  },
  "c": {
    "a": 1.876881750827106,
    "k": 0.17731103663129694
  },
  "b": {
    "a": 4.200283716500263,
    "k": 0.17732408628155766
  },
  "a": {
    "a": 6.833438166658096,
    "k": 0.17730769215695602
  }
};
  const personalData=Object.fromEntries(Object.entries(recipes).map(([key,r])=>[key,preparePersonalBatches(typeof personalBatches==='undefined'?[]:personalBatches[key]??[],r.min)]));
  const DIAMOND_DUST_MINUTES = 14;
  const $=id=>document.getElementById(id), skill=$('skill'),progress=$('progress'),recipe=$('recipe'),target=$('target'),price=$('price'),result=$('result'),note=$('range-note');
  const position=p=>p[1]+p[2]/100;
  let language='pt-BR';
  try { const saved=localStorage.getItem('pxg-language'); if(Object.hasOwn(translations,saved))language=saved; } catch {}
  const tr=(key,values={})=>translations[language][key].replace(/\{(\w+)\}/g,(_,name)=>values[name]??'');
  const fmt=(n,options={})=>new Intl.NumberFormat(language,options).format(n);
  const decimal=n=>fmt(n,{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false});
  function parseDecimal(value){
    const parts=new Intl.NumberFormat(language).formatToParts(12345.6);
    const group=parts.find(p=>p.type==='group')?.value;
    const separator=parts.find(p=>p.type==='decimal').value;
    let s=String(value).trim(); if(!s)return NaN;
    if(group)s=s.split(group).join('');
    s=s.replace(/\s/g,'').replace(separator,'.');
    return /^\d+(?:\.\d+)?$/.test(s)?Number(s):NaN;
  }
  function parsePercent(s){const v=String(s).trim().replace(',','.');return /^\d+(?:\.\d+)?$/.test(v)?Number(v):NaN}
  function interpolate(points,x){for(let i=0;i<points.length-1;i++){const p=points[i],q=points[i+1],lo=position(p),hi=position(q);if(x>=lo-1e-8&&x<=hi+1e-8)return p[0]+(x-lo)/(hi-lo)*(q[0]-p[0])}return null}
  function accumulatedRecipes(recipeKey,points,x){
    const origin=position(points[0]),last=position(points.at(-1));
    const personal=personalData[recipeKey]?.points===points?personalData[recipeKey]:null;
    const upper=personal?.forecastEnd??last;
    if(x<origin-1e-8||x>upper+1e-8)return null;
    const model=personal?personal.model:progressionModels[recipeKey];
    if(personal&&model){
      // Honor every observed total exactly; use the fitted XP shape between them.
      for(let i=0;i<points.length-1;i++){
        const p=points[i],q=points[i+1],lo=position(p),hi=position(q);
        if(x>=lo-1e-8&&x<=hi+1e-8)return p[0]+(q[0]-p[0])*progressionWeight(x,lo,model.k)/progressionWeight(hi,lo,model.k);
      }
      return points.at(-1)[0]+model.a*(progressionWeight(x,origin,model.k)-progressionWeight(last,origin,model.k));
    }
    return model?points[0][0]+model.a*progressionWeight(x,origin,model.k):interpolate(points,x);
  }
  function timeString(total){const hours=Math.floor(total/60),minutes=total%60,h=language==='pl'?'godz.':'h';return hours?`${fmt(hours)} ${h}${minutes?` ${String(minutes).padStart(2,'0')} min`:''}`:`${minutes} min`}
  function empty(title,help){result.innerHTML=`<div class="empty"><h2>${tr(title)}</h2><p>${help}</p></div>`}
  function calculationDetails(points,usePersonal){
    const model=usePersonal?personalData[recipe.value].model:progressionModels[recipe.value];
    const number=n=>fmt(n,{maximumFractionDigits:8,useGrouping:false});
    const method=tr(model?'formulaLog':'formulaLinear'),source=tr(usePersonal?'formulaPersonal':'formulaHistorical');
    const formula=model?(usePersonal?'N(s) = N₁ + (T(s) − T(s₁)) / (T(s₂) − T(s₁)) × (N₂ − N₁)<br>':'N(s) = A × (T(s) − T(s₀))<br>')+'T(s) = e<sup>k(⌊s⌋ − s₀)</sup> × (1 + (s − ⌊s⌋) × (e<sup>k</sup> − 1))'+(usePersonal?`<br>${tr('formulaForecast')}: N(s) = N(last) + A × (T(s) − T(last))`:''):'N(s) = N₁ + (s − s₁) / (s₂ − s₁) × (N₂ − N₁)';
    const parameters=model?`<p class="formula-parameters">A ≈ ${number(model.a)} · k ≈ ${number(model.k)} · s₀ = ${number(position(points[0]))}</p><p>${tr('formulaParameters')}</p>`:`<p>${tr('formulaNeighbors')}</p>`;
    return `<p class="model-caption">${method} · ${source}</p><details class="calculation-details"><summary>${tr('formulaTitle')}</summary><div class="calculation-body"><p>${tr('formulaDisclaimer')}</p><p class="formula-equation">${formula}</p>${parameters}<p>${tr('formulaSkill')}</p><p>${tr('formulaRounding')}</p><p>${tr('formulaRange',{start:number(position(points[0])),end:number(position(points.at(-1)))})}</p></div></details>`;
  }
  function update(){
    const s=Number(skill.value),p=parsePercent(progress.value),t=Number(target.value),r=recipes[recipe.value],cash=price.value.trim()?parseDecimal(price.value):null;
    $('recipe-help').textContent=tr('available',{min:r.min})+(r.batch?' · '+tr('batch',{batch:r.batch}):'')+(r.minutes?' · '+tr('perRecipe',{value:timeString(r.minutes)}):'')+'.';
    const personal=personalData[recipe.value];
    if(personal.status)$('recipe-help').textContent+=' '+tr(personal.status);
    if(!Number.isInteger(s)||s<0||s>100||!Number.isFinite(p)||p<0||p>=100){note.textContent=tr('invalidSkill',{max:decimal(99.99)});empty('checkSkill',tr('percentHelp'));return}
    if(cash!==null&&(!Number.isFinite(cash)||cash<0)){note.textContent=tr('invalidCost',{example:fmt(25000.5)});empty('checkCost',tr('costHelp'));return}
    if(t<=s+p/100){note.textContent=tr('higherTarget');empty('reached',tr('higherRank'));return}
    if(s<r.min){note.textContent=tr('requires',r);empty('locked',tr('unlock',r));return}
    const current=s+p/100,usePersonal=!!personal.points&&current>=position(personal.points[0])-1e-8&&t<=(personal.forecastEnd??position(personal.points.at(-1)))+1e-8,segments=usePersonal?[personal.points]:(r.segments||[r.points]),segment=segments.find(points=>current>=position(points[0])-1e-8&&t<=(usePersonal?(personal.forecastEnd??position(points.at(-1))):position(points.at(-1)))+1e-8);
    if(!segment){const coverage=segments.map(points=>`${points[0][1]} + ${decimal(points[0][2])}% ${tr('to')} ${points.at(-1)[1]} + ${decimal(points.at(-1)[2])}%`).join(` ${tr('or')} `);note.textContent=tr('coverage',{name:r.name,coverage});empty('insufficient',tr('insufficientHelp'));return}
    const start=accumulatedRecipes(recipe.value,segment,current),end=accumulatedRecipes(recipe.value,segment,t),crafts=Math.max(0,Math.ceil(end-start-1e-9)),produced=r.batch?fmt(crafts*r.batch):'—',duration=r.minutes?timeString(crafts*r.minutes):'—';
    note.innerHTML=`<strong>${r.name}</strong> · ${tr(usePersonal?'personalCheckpoints':'checkpoints',{count:fmt(segment.length),start:decimal(position(segment[0])),end:decimal(position(segment.at(-1)))})}`;
    const cost=cash!==null?`<div class="metric"><div class="v">${fmt(Math.round(crafts*cash))}</div><div class="l">${tr('totalCost')}</div></div>`:'';
    const dust=r.minutes?`<div class="dust-cost">${tr('dustEstimate')} <strong>${fmt(Math.ceil(crafts*r.minutes/DIAMOND_DUST_MINUTES))} Diamond Dust</strong> ${tr('instant')} <span>${tr('dustRate',{minutes:DIAMOND_DUST_MINUTES})}</span></div>`:'';
    const fraction=Math.max(0,Math.min(100,(current-Math.floor(current))*100));
    const extrapolated=usePersonal&&t>position(segment.at(-1))+1e-8;
    const details=calculationDetails(segment,usePersonal)+(extrapolated?`<p class="notice">${tr('personalForecast',{end:decimal(position(segment.at(-1))),limit:personal.forecastEnd})}</p>`:'');
    result.innerHTML=`<div class="result-overline">${tr('estimate',{target:t})}</div><div class="hero-number">${fmt(crafts)}</div><div class="hero-caption">${tr('remaining',{name:r.name})}</div><div class="meter" role="progressbar" aria-valuenow="${fraction.toFixed(1)}" aria-valuemin="0" aria-valuemax="100" aria-label="${tr('currentProgress')}"><b style="width:${fraction}%"></b></div><div class="meter-labels"><span>${tr('skillValue',{skill:s})} · ${decimal(p)}%</span><span>${tr('target')} ${t}</span></div><div class="metrics"><div class="metric"><div class="v">${produced}</div><div class="l">${tr('units')}${r.batch?' · '+tr('perRecipe',{value:r.batch}):''}</div></div><div class="metric"><div class="v">${duration}</div><div class="l">${tr('duration')}</div>${dust}</div><div class="metric"><div class="v">${usePersonal?personal.year:2020}</div><div class="l">${tr('year')}</div></div>${cost}</div><div class="notice"><span class="icon">✳</span><div><strong>${tr('empirical')}</strong> ${tr(usePersonal?(personal.model?'personalMethod':'personalLinearMethod'):progressionModels[recipe.value]?'logMethod':'linearMethod')} ${tr('notice')}${r.source?` <a href="${r.source}" target="_blank" rel="noopener noreferrer">${tr('viewRecipe')}</a>`:''}</div></div>${details}`;
  }
  function applyLanguage(){
    document.documentElement.lang=language;
    document.title=tr('title');
    document.querySelector('meta[name="description"]').content=tr('description');
    document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=tr(el.dataset.i18n));
    result.setAttribute('aria-label',tr('resultLabel'));
    price.placeholder=fmt(25000);
    [...target.options].forEach((option,i)=>option.textContent=i<4?tr('rank',{rank:['D','C','B','A'][i],skill:option.value}):tr('skillValue',{skill:option.value}));
    document.querySelectorAll('[data-language]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
    update();
  }
  document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>{
    const next=button.dataset.language;if(!Object.hasOwn(translations,next))return;
    const cash=parseDecimal(price.value),percent=parsePercent(progress.value);
    language=next;
    if(Number.isFinite(cash))price.value=fmt(cash,{maximumFractionDigits:20});
    if(Number.isFinite(percent))progress.value=fmt(percent,{useGrouping:false,maximumFractionDigits:20});
    try {localStorage.setItem('pxg-language',language)} catch {}
    applyLanguage();
  }));
  function autoTarget(){const s=Number(skill.value);if(Number.isFinite(s)){const next=[20,40,60,80,100].find(x=>x>s);if(next)target.value=String(next)}update()}
  skill.addEventListener('input',autoTarget);for(const el of [progress,recipe,target,price])el.addEventListener(el.tagName==='SELECT'?'change':'input',update);
  progress.value=fmt(parsePercent(progress.value),{useGrouping:false,maximumFractionDigits:20});
  applyLanguage();
