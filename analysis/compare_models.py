"""Run with python analysis/compare_models.py. Standard library only.

Fits historical data only. The personal batch is an external comparison,
never used to fit or select coefficients. The badge correction assumes the
historical measurements had no bonus and today's bonus multiplies recipe XP.
"""
import json
import math
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'app.js').read_text(encoding='utf-8')
hist = {}
for key in 'dcba':
    raw = json.loads(re.search(r'\b'+key+r':\{.*?points:(\[\[.*?\]\])', source)[1])
    hist[key] = [(s+p/100, n) for n,s,p in raw]
batch_script = "const fs=require('fs'),vm=require('vm');console.log(JSON.stringify(vm.runInNewContext(fs.readFileSync('batches.js','utf8')+';personalBatches')));"
batches = json.loads(subprocess.check_output(['node','-e',batch_script],cwd=ROOT,text=True))


def optimize(fn,lo,hi):
    grid=[lo+(hi-lo)*i/1000 for i in range(1001)]
    i=min(range(len(grid)),key=lambda i:fn(grid[i])[0])
    boundary=i in (0,1000)
    left,right=grid[max(0,i-1)],grid[min(1000,i+1)]
    ratio=(math.sqrt(5)-1)/2
    for _ in range(80):
        a,b=right-ratio*(right-left),left+ratio*(right-left)
        if fn(a)[0]<fn(b)[0]:right=b
        else:left=a
    return (left+right)/2,boundary


def fit(points,kind):
    origin=points[0][0]
    if kind=='piecewise':
        def predict(s):
            for (x,n),(y,m) in zip(points,points[1:]):
                if x-1e-8<=s<=y+1e-8:return n+(s-x)/(y-x)*(m-n)
            raise ValueError('Outside range')
        return predict,{}
    if kind=='quadratic':
        xs=[s-origin for s,n in points]
        s2=sum(x*x for x in xs);s3=sum(x**3 for x in xs);s4=sum(x**4 for x in xs)
        t1=sum(x*n for x,(_,n) in zip(xs,points));t2=sum(x*x*n for x,(_,n) in zip(xs,points))
        det=s2*s4-s3*s3
        a,b=(t1*s4-t2*s3)/det,(s2*t2-s3*t1)/det
        return lambda s:a*(s-origin)+b*(s-origin)**2,{'a':a,'b':b}

    def weights(s,p):
        if kind=='linear':return s-origin
        if kind in ('power2','power3','power'):
            # Normalization avoids large powers; coefficient absorbs origin**p.
            return math.expm1(p*math.log(s/origin))
        if kind=='exponential':return math.expm1(p*(s-origin))
        if kind=='discrete_exponential':
            # XP thresholds grow exponentially by integer skill; percentage
            # means a fraction of XP between adjacent integer thresholds.
            def xp(v):
                n=math.floor(v);fraction=v-n
                return math.exp(p*(n-origin))*(1+fraction*math.expm1(p))
            return xp(s)-xp(origin)
        raise ValueError(kind)

    def evaluate(p):
        ws=[weights(s,p) for s,n in points]
        a=sum(w*n for w,(_,n) in zip(ws,points))/sum(w*w for w in ws)
        return sum((a*w-n)**2 for w,(_,n) in zip(ws,points)),a
    boundary=False
    if kind in ('exponential','discrete_exponential'):p,boundary=optimize(evaluate,0.000001,1)
    elif kind=='power':p,boundary=optimize(evaluate,0.1,40)
    else:p={'linear':1,'power2':2,'power3':3}[kind]
    _,a=evaluate(p)
    return lambda s:a*weights(s,p),{'a':a,'shape':p,'search_boundary':boundary}


KINDS=['linear','power2','power3','power','quadratic','exponential','discrete_exponential','piecewise']
FORMULAS={
    'linear':'N(s) = a (s - s0)',
    'power2':'N(s) = a ((s / s0)^2 - 1)',
    'power3':'N(s) = a ((s / s0)^3 - 1)',
    'power':'N(s) = a ((s / s0)^p - 1), fitted p',
    'quadratic':'N(s) = a (s - s0) + b (s - s0)^2',
    'exponential':'N(s) = a (exp(k (s - s0)) - 1)',
    'discrete_exponential':'N(s) = a (T(s) - T(s0)); T(s) = exp(k (floor(s)-s0)) (1 + frac(s) (exp(k)-1))',
    'piecewise':'Linear interpolation between adjacent measured checkpoints',
}
results={}
for key,points in hist.items():
    results[key]={}
    for kind in KINDS:
        predict,parameters=fit(points,kind)
        errors=[predict(s)-n for s,n in points]
        validation=[]
        for i in range(1,len(points)-1):
            held_predict,_=fit(points[:i]+points[i+1:],kind)
            validation.append(held_predict(points[i][0])-points[i][1])
        samples=[predict(points[0][0]+(points[-1][0]-points[0][0])*i/100) for i in range(101)]
        personal=[]
        for batch in batches.get(key,[]):
            start=batch['before'][0]+batch['before'][1]/100
            end=batch['after'][0]+batch['after'][1]/100
            if not points[0][0]<=start<end<=points[-1][0]:continue
            raw=predict(end)-predict(start)
            personal.append({'batch':batch,'historical_prediction':raw,
                             'badge_20_prediction':raw/1.2,
                             'badge_20_rounded':math.ceil(raw/1.2-1e-9),
                             'observed':batch['crafts'],
                             'error_with_badge':raw/1.2-batch['crafts']})
        results[key][kind]={'parameters':parameters,'fit_rmse':math.sqrt(sum(e*e for e in errors)/len(errors)),
                            'held_out_mae':sum(abs(e) for e in validation)/len(validation),
                            'monotone_in_range':all(a<=b for a,b in zip(samples,samples[1:])),
                            'personal_comparison':personal}

# Numerical checks independent of the historical dataset.
synthetic=[(50+x,3*math.expm1(.17*x)) for x in (0,2,5,10,20)]
predict,params=fit(synthetic,'exponential')
assert abs(params['shape']-.17)<1e-6
assert all(abs(predict(s)-n)<1e-5 for s,n in synthetic)
for key in hist:
    assert results[key]['exponential']['held_out_mae']<.2

output={'formulas':FORMULAS,'badge_assumption':'Historical bonus assumed 0%; personal bonus 20%. Not verified for historical data.',
        'validation':'Hold out one interior cumulative checkpoint at a time; keep endpoints. Not an independent experimental replicate.',
        'results':results}
(ROOT/'analysis/model-comparison.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Finder B: historical held-out MAE | badge-adjusted prediction for real batch')
for kind,row in results['b'].items():
    personal=row['personal_comparison']
    value=personal[0]['badge_20_prediction'] if personal else float('nan')
    print(f"{kind:24} MAE={row['held_out_mae']:8.3f} prediction={value:8.3f} monotone={row['monotone_in_range']}")
print('\nHeld-out MAE across finders D/C/B/A:')
for kind in KINDS:
    print(kind, ' / '.join(f"{results[k][kind]['held_out_mae']:.3f}" for k in 'dcba'))
print('Numerical checks passed. App and batches unchanged.')
