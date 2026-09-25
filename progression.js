// XP requirements grow at integer levels; the bar is linear within each level.
function progressionWeight(x,origin,k){
  const xp=s=>Math.exp(k*(Math.floor(s)-origin))*(1+(s-Math.floor(s))*Math.expm1(k));
  return xp(x)-xp(origin);
}
// Fit recipe equivalents, not absolute XP. Active bonuses are already included.
function fitProgression(points){
  const origin=points[0][1]+points[0][2]/100;
  function evaluate(k){
    const weights=points.map(p=>progressionWeight(p[1]+p[2]/100,origin,k));
    const a=weights.reduce((sum,w,i)=>sum+w*points[i][0],0)/weights.reduce((sum,w)=>sum+w*w,0);
    return {a,k,error:weights.reduce((sum,w,i)=>sum+(a*w-points[i][0])**2,0)};
  }
  let best=0,bestError=Infinity;
  for(let i=0;i<=1000;i++){
    const {error}=evaluate(0.000001+i*0.001);
    if(error<bestError){best=i;bestError=error}
  }
  // A minimum at a search boundary is not evidence of a logarithmic fit.
  if(best===0||best===1000)return null;
  let lo=0.000001+(best-1)*0.001,hi=0.000001+(best+1)*0.001;
  const ratio=(Math.sqrt(5)-1)/2;
  for(let i=0;i<100;i++){
    const left=hi-ratio*(hi-lo),right=lo+ratio*(hi-lo);
    if(evaluate(left).error<evaluate(right).error)hi=right;else lo=left;
  }
  const model=evaluate((lo+hi)/2);
  return Number.isFinite(model.a)&&model.a>0?model:null;
}

function preparePersonalBatches(rows,minSkill){
  if(!Array.isArray(rows))return {status:'personalInvalid'};
  if(!rows.length)return {status:null};
  const value=p=>p[0]+p[1]/100;
  const valid=p=>Array.isArray(p)&&p.length===2&&Number.isInteger(p[0])&&p[0]>=minSkill&&p[0]<=100&&Number.isFinite(p[1])&&p[1]>=0&&p[1]<100;
  const points=[];let total=0,previous=null,previousDate='';
  for(const row of rows){
    if(!row||!valid(row.before)||!valid(row.after)||!Number.isSafeInteger(row.crafts)||row.crafts<=0||value(row.after)<=value(row.before))return {status:'personalInvalid'};
    if(typeof row.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date))||new Date(row.date).toISOString().slice(0,10)!==row.date||row.date<previousDate)return {status:'personalInvalid'};
    if(previous&&Math.abs(value(row.before)-value(previous))>1e-8)return {status:'personalInvalid'};
    if(!previous)points.push([0,...row.before]);
    total+=row.crafts;if(!Number.isSafeInteger(total))return {status:'personalInvalid'};
    points.push([total,...row.after]);previous=row.after;previousDate=row.date;
  }
  // Even one measured batch provides a valid interval for linear interpolation.
  const model=rows.length>=3?fitProgression(points):null;
  // Permit a short forecast only when every measured batch agrees within 5%.
  // This is a consistency check, not proof of the game's formula.
  let forecastEnd=null;
  if(model){
    const origin=value(rows[0].before);
    const maxError=Math.max(...rows.map(row=>Math.abs(model.a*(progressionWeight(value(row.after),origin,model.k)-progressionWeight(value(row.before),origin,model.k))/row.crafts-1)));
    const last=value(rows.at(-1).after);
    if(maxError<=0.05)forecastEnd=Math.min(100,Math.ceil(last/20)*20,last+(last-origin));
  }
  const years=[...new Set(rows.map(row=>row.date.slice(0,4)))];
  return {status:model?'personalReady':'personalLinear',points,model,forecastEnd,year:years.length===1?years[0]:`${years[0]}–${years.at(-1)}`};
}
