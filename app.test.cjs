const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(saved,blocked=false,batches={}){
  const elements={};
  for(const [id,value] of Object.entries({skill:'73',progress:'42,15',recipe:'b',target:'80',price:'',result:'','range-note':'','recipe-help':'',language:''})){
    elements[id]={value,tagName:['recipe','target','language'].includes(id)?'SELECT':'INPUT',listeners:{},addEventListener(event,fn){this.listeners[event]=fn},setAttribute(name,value){this[name]=value}};
  }
  elements.target.options=[20,40,60,80,100].map(value=>({value:String(value)}));
  const html=fs.readFileSync('index.html','utf8');
  const labels=[...html.matchAll(/data-i18n="([^"]+)"/g)].map(m=>({dataset:{i18n:m[1]}}));
  const buttons=['pt-BR','en','es','pl'].map(language=>({dataset:{language},listeners:{},addEventListener(event,fn){this.listeners[event]=fn},setAttribute(name,value){this[name]=value}}));
  elements.languages=buttons;
  const document={documentElement:{},getElementById:id=>elements[id],querySelector:()=>({}),querySelectorAll:selector=>selector==='[data-language]'?buttons:labels};
  const store={value:saved,getItem(){if(blocked)throw Error();return this.value},setItem(key,value){if(blocked)throw Error();this.value=value}};
  const context=vm.createContext({document,localStorage:store,Intl});
  for(const file of ['i18n.js','progression.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  vm.runInContext(`const personalBatches=${JSON.stringify(batches)}`,context);
  vm.runInContext(fs.readFileSync('app.js','utf8'),context);
  return {elements,labels,document,store,run:code=>vm.runInContext(code,context)};
}
test('all languages translate static text, results and validation states',()=>{
  for(const language of ['pt-BR','en','es','pl']){
    const {elements:e,labels,document,run}=setup(language);
    assert.equal(document.documentElement.lang,language);
    assert.ok(labels.length>=20);
    assert.ok(labels.every(el=>typeof el.textContent==='string'&&el.textContent.length));
    assert.match(e.result.innerHTML,/636 Diamond Dust/);
    assert.match(e.result.innerHTML,/hero-number">89</);
    for(const [field,value,key] of [['progress','100','checkSkill'],['price','invalid','checkCost'],['target','60','reached'],['skill','30','locked'],['target','100','insufficient']]){
      e.skill.value='73';e.progress.value='42,15';e.price.value='';e.target.value='80';
      e[field].value=value;run('update()');
      assert.ok(e.result.innerHTML.includes(run(`tr('${key}')`)));
      assert.ok(!e.result.innerHTML.includes('dust-cost'));
    }
  }
});

function exampleBatches(){
  // Independently invert integer-level XP thresholds, then the linear XP bar.
  const checkpoints=[0,10,30,60].map(n=>{
    const threshold=1+n/10,level=Math.floor(70+Math.log(threshold)/0.18);
    const fraction=(threshold/Math.exp(.18*(level-70))-1)/Math.expm1(.18);
    return [level,fraction*100];
  });
  return [10,20,30].map((crafts,i)=>({date:'2026-09-23',crafts,before:checkpoints[i],after:checkpoints[i+1]}));
}

test('personal batches refit the curve and update provenance in all languages',()=>{
  for(const language of ['pt-BR','en','es','pl']){
    const {elements:e,run}=setup(language,false,{b:exampleBatches()});
    assert.ok(Math.abs(run('personalData.b.model.k')-0.18)<1e-6);
    assert.ok(Math.abs(run('personalData.b.model.a')-10)<1e-5);
    e.skill.value='70';e.progress.value='0';e.target.value='80';run('update()');
    assert.match(e.result.innerHTML,/hero-number">51</);
    assert.match(e.result.innerHTML,/>2026</);
    assert.ok(e.result.innerHTML.includes(run("tr('personalMethod')")));
    // Outside the personal range, retain the historical model and provenance.
    e.skill.value='69';run('update()');
    assert.match(e.result.innerHTML,/>2020</);
    assert.ok(e.result.innerHTML.includes(run("tr('logMethod')")));
  }
});

test('invalid batches or targets outside the personal range retain historical results',()=>{
  const cases=[
    [exampleBatches().slice(0,2),'personalLinear'],
    [exampleBatches().map((r,i)=>i===1?{...r,before:[71,0]}:r),'personalInvalid'],
    [exampleBatches().map(r=>({...r,crafts:-1})),'personalInvalid'],
    [exampleBatches().map(r=>({...r,date:'2026-02-30'})),'personalInvalid'],
    [[0,1,2].map(i=>({date:'2026-09-23',crafts:10,before:[70+i,0],after:[71+i,0]})),'personalLinear'],
  ];
  for(const [rows,status] of cases){
    const {elements:e,run}=setup(undefined,false,{b:rows});
    assert.equal(run('personalData.b.status'),status);
    assert.match(e.result.innerHTML,/hero-number">89</);
    assert.ok(e['recipe-help'].textContent.includes(run(`tr('${status}')`)));
  }
});

test('a single real batch is honored without requiring three batches',()=>{
  const batch={date:'2026-09-23',crafts:4,before:[74,42.23],after:[75,26.02]};
  for(const language of ['pt-BR','en','es','pl']){
    const {elements:e,run}=setup(language,false,{b:[batch]});
    assert.equal(run('personalData.b.status'),'personalLinear');
    e.skill.value='74';e.progress.value='42.23';e.target.value='75.2602';run('update()');
    assert.match(e.result.innerHTML,/hero-number">4</);
    assert.match(e.result.innerHTML,/>2026</);
    assert.ok(e.result.innerHTML.includes(run("tr('personalLinearMethod')")));
    assert.ok(e.result.innerHTML.includes(run("tr('formulaLinear')")));
    // Partial observed interval and integer skill target also use personal data.
    e.target.value='75';run('update()');
    assert.match(e.result.innerHTML,/hero-number">3</);
    e.target.value='80';run('update()');
    assert.match(e.result.innerHTML,/>2020</);
    assert.ok(e.result.innerHTML.includes(run("tr('formulaHistorical')")));
  }
});
test('switching language preserves numeric inputs and saves preference',()=>{
  const {elements:e,store,run}=setup();
  e.price.value='25.000,50';
  for(const language of ['en','es','pl','pt-BR']){
    e.languages.find(button=>button.dataset.language===language).listeners.click();
    assert.deepEqual(e.languages.filter(button=>button['aria-pressed']==='true').map(button=>button.dataset.language),[language]);
    assert.equal(run('parseDecimal(price.value)'),25000.5);
    assert.equal(run('parsePercent(progress.value)'),42.15);
    assert.equal(store.value,language);
    assert.match(e.result.innerHTML,/636 Diamond Dust/);
  }
});
test('invalid preferences and unavailable storage fall back to Portuguese',()=>{
  assert.equal(setup('invalid').document.documentElement.lang,'pt-BR');
  const {elements:e,document}=setup(null,true);
  e.languages.find(button=>button.dataset.language==='pl').listeners.click();
  assert.equal(document.documentElement.lang,'pl');
});

test('integer-level models reproduce historical checkpoints within 0.02 recipe',()=>{
  const {run}=setup();
  const fits=JSON.parse(fs.readFileSync('analysis/progression-fit.json','utf8')).recipes;
  for(const [name,fit] of Object.entries(fits)){
    const key=name.toLowerCase();
    for(const point of fit.residuals){
      const predicted=run(`accumulatedRecipes('${key}',recipes.${key}.points,${point.skill})`);
      assert.ok(Math.abs(predicted-point.actual_recipes)<0.02);
    }
    assert.equal(run(`accumulatedRecipes('${key}',recipes.${key}.points,${fit.initial_skill-0.01})`),null);
    assert.equal(run(`accumulatedRecipes('${key}',recipes.${key}.points,101)`),null);
  }
});

test('logarithmic estimates update quantity, time, dust and material cost together',()=>{
  const {elements:e,run}=setup();
  // At skill 70, the old linear interpolation produced 104 recipes.
  // The fitted curve predicts between 107 and 108 recipes, rounded up to 108.
  e.skill.value='70';e.progress.value='0';e.price.value='1.000';run('update()');
  assert.match(e.result.innerHTML,/hero-number">108</);
  assert.match(e.result.innerHTML,/>1\.080</);
  assert.match(e.result.innerHTML,/>180 h</);
  assert.match(e.result.innerHTML,/772 Diamond Dust/);
  assert.match(e.result.innerHTML,/>108\.000</);
  assert.ok(e.result.innerHTML.includes(run("tr('logMethod')")));
  e.skill.value='79';e.progress.value='99,99';run('update()');
  assert.match(e.result.innerHTML,/hero-number">1</);
});

test('sparse recipes retain linear interpolation and gaps remain unsupported',()=>{
  const {elements:e,run}=setup();
  e.recipe.value='e';e.skill.value='20';e.progress.value='74,29';e.target.value='23';run('update()');
  assert.match(e.result.innerHTML,/hero-number">9</);
  assert.ok(e.result.innerHTML.includes(run("tr('linearMethod')")));
  e.recipe.value='lock';e.skill.value='0';e.progress.value='0';e.target.value='20';run('update()');
  assert.match(e.result.innerHTML,/hero-number">193</);
  e.skill.value='21';e.target.value='25';run('update()');
  assert.ok(e.result.innerHTML.includes(run("tr('insufficient')")));
});

test('confirmed batches preserve measured totals and forecast 17 recipes to skill 80',()=>{
  const batches=vm.runInNewContext(fs.readFileSync('batches.js','utf8')+';personalBatches');
  assert.deepEqual(Array.from(batches.b,r=>r.crafts),[4,1,4,8,9]);
  for(const language of ['pt-BR','en','es','pl']){
    const {elements:e,run}=setup(language,false,batches);
    assert.equal(run('personalData.b.forecastEnd'),80);
    for(const row of batches.b){
      const lo=row.before[0]+row.before[1]/100,hi=row.after[0]+row.after[1]/100;
      const count=run(`accumulatedRecipes('b',personalData.b.points,${hi})-accumulatedRecipes('b',personalData.b.points,${lo})`);
      assert.ok(Math.abs(count-row.crafts)<1e-8);
    }
    e.skill.value='78';e.progress.value='43.04';e.target.value='80';run('update()');
    assert.match(e.result.innerHTML,/hero-number">17</);
    assert.match(e.result.innerHTML,/>170</);
    assert.match(e.result.innerHTML,/122 Diamond Dust/);
    assert.match(e.result.innerHTML,/>2026</);
    assert.ok(e.result.innerHTML.includes(run("tr('personalForecast',{end:decimal(78.4304),limit:80})")));
    assert.equal(run("accumulatedRecipes('b',personalData.b.points,80.01)"),null);
    e.target.value='100';run('update()');
    assert.ok(e.result.innerHTML.includes(run("tr('insufficient')")));
  }
});

test('inconsistent counts cannot enable a personal forecast',()=>{
  const batches=vm.runInNewContext(fs.readFileSync('batches.js','utf8')+';personalBatches');
  for(const row of batches.b.slice(2))row.crafts=1;
  const {run}=setup('en',false,batches);
  assert.equal(run('personalData.b.forecastEnd'),null);
});

test('XP percentage is linear within a whole level and continuous across levels',()=>{
  const {run}=setup();
  const a=run("accumulatedRecipes('b',recipes.b.points,75)");
  const b=run("accumulatedRecipes('b',recipes.b.points,76)");
  assert.ok(Math.abs(run("accumulatedRecipes('b',recipes.b.points,75.25)")-(a+.25*(b-a)))<1e-10);
  assert.ok(Math.abs(run("accumulatedRecipes('b',recipes.b.points,76-1e-9)")-b)<1e-7);
});
