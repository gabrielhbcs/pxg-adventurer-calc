"""Audit current batches without modifying measurements or the calculator.

Run: python analysis/analyze_personal.py
Standard library + Node. Refreshes the historical comparison first, then writes
personal-analysis.json and personal-analysis.md. No inferred counts are applied.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(ROOT / 'analysis/compare_models.py')],
               cwd=ROOT, check=True, capture_output=True)
comparison = json.loads((ROOT / 'analysis/model-comparison.json').read_text())
historical = comparison['results']['b']
rows = historical['discrete_exponential']['personal_comparison']
if len(rows) < 4:
    raise SystemExit('At least four in-range Finder B batches are required.')


def skill(p):
    return p[0] + p[1] / 100


def optimize(fn, lo, hi):
    grid = [lo + (hi-lo)*i/2000 for i in range(2001)]
    idx = min(range(len(grid)), key=lambda i: fn(grid[i])[0])
    a, b = grid[max(0, idx-1)], grid[min(2000, idx+1)]
    ratio = (math.sqrt(5)-1)/2
    for _ in range(80):
        c, d = b-ratio*(b-a), a+ratio*(b-a)
        if fn(c)[0] < fn(d)[0]: b = d
        else: a = c
    return (a+b)/2, idx in (0, 2000)


def shape(s, k, kind):
    # Normalize the derivative near skill 75; k=0 is exactly linear.
    if abs(k) < 1e-10:
        return s-75
    if kind == 'continuous':
        return math.expm1(k*(s-75))/k
    n, f = math.floor(s), s-math.floor(s)
    return math.expm1(k*(n-75))/math.expm1(k) + f*math.exp(k*(n-75))


def fit_batches(data, kind, limits=None):
    def evaluate(k):
        changes = [shape(skill(r['batch']['after']), k, kind) -
                   shape(skill(r['batch']['before']), k, kind) for r in data]
        counts = [r['observed'] for r in data]
        scale = sum(x*y for x, y in zip(changes, counts))/sum(x*x for x in changes)
        return sum((scale*x-y)**2 for x, y in zip(changes, counts)), scale
    k, boundary = optimize(evaluate, *limits) if limits else (0, False)
    error, scale = evaluate(k)
    def predict(r):
        return scale*(shape(skill(r['batch']['after']), k, kind) -
                      shape(skill(r['batch']['before']), k, kind))
    return predict, {'k': k, 'q': math.exp(k), 'scale': scale,
                     'rmse': math.sqrt(error/len(data)), 'boundary': boundary}


models = {}
for label, kind, limits in [
    ('linear', 'continuous', None),
    ('continuous_increasing_cost', 'continuous', (0, 1)),
    ('discrete_increasing_cost', 'discrete', (0, 1)),
    ('continuous_allow_decreasing_cost', 'continuous', (-3, 1)),
    ('discrete_allow_decreasing_cost', 'discrete', (-3, 1)),
]:
    models[label] = {}
    for subset, data in [('all', rows), ('last_four', rows[-4:])]:
        predict, result = fit_batches(data, kind, limits)
        result['predictions'] = [predict(r) for r in data]
        errors = []
        for i, r in enumerate(data):
            held, _ = fit_batches(data[:i]+data[i+1:], kind, limits)
            errors.append(held(r)-r['observed'])
        result['leave_one_batch_out_mae'] = sum(map(abs, errors))/len(errors)
        forward, _ = fit_batches(data[:-1], kind, limits)
        result['last_batch_forward_prediction'] = forward(data[-1])
        models[label][subset] = result

# Fixed historical shapes with either a conditional +20% correction or a
# freely fitted common multiplier. Fit differences, not cumulative endpoints.
historical_candidates = {}
for name, model in historical.items():
    data = model['personal_comparison'][-4:]
    xs = [r['historical_prediction'] for r in data]
    ys = [r['observed'] for r in data]
    scale = sum(x*y for x, y in zip(xs, ys))/sum(x*x for x in xs)
    historical_candidates[name] = {
        'historical_held_out_mae': model['held_out_mae'],
        'historical_monotone': model['monotone_in_range'],
        'bonus_20_predictions': [x/1.2 for x in xs],
        'best_constant_multiplier': 1/scale,
        'best_constant_predictions': [scale*x for x in xs],
        'best_constant_rmse': math.sqrt(sum((scale*x-y)**2 for x,y in zip(xs,ys))/len(xs)),
    }

q = math.exp(historical['discrete_exponential']['parameters']['shape'])
reference = rows[0]['historical_prediction']/rows[0]['observed']
diagnostics = []
for r in rows:
    equivalent = r['historical_prediction']/reference
    diagnostics.append({
        'batch': r['batch'], 'skill_gain': skill(r['batch']['after'])-skill(r['batch']['before']),
        'historical_recipes': r['historical_prediction'],
        'conditional_bonus_20_recipes': r['badge_20_prediction'],
        'required_multiplier': r['historical_prediction']/r['observed'],
        'recipes_at_first_batch_rate': equivalent,
        'nearest_integer_hypothesis': round(equivalent),
        'integer_residual': equivalent-round(equivalent),
    })

# Recover the cost of a whole level at 75 in historical recipe equivalents.
params = historical['discrete_exponential']['parameters']
origin = 60.6820
c75 = params['a']*math.exp(params['shape']*(75-origin))*math.expm1(params['shape'])

# Numerical checks: exact linear limit, continuity at a level boundary, and
# recovery of a known discrete curve from synthetic independent batch gains.
assert shape(76.2, 0, 'discrete') == 76.2-75
assert abs(shape(76-1e-9, .18, 'discrete')-shape(76, .18, 'discrete')) < 1e-8
synthetic = []
for a,b in [(73.2,74.1),(74.1,75.8),(75.8,78.4),(78.4,80.0)]:
    pair = lambda s: [math.floor(s), (s-math.floor(s))*100]
    synthetic.append({'batch': {'before':pair(a), 'after':pair(b)},
                      'observed':3*(shape(b,.18,'discrete')-shape(a,.18,'discrete'))})
_, known = fit_batches(synthetic, 'discrete', (0,1))
assert abs(known['k']-.18) < 1e-6 and abs(known['scale']-3) < 1e-5

app_fit_script = "const fs=require('fs'),vm=require('vm');const c=vm.createContext({});for(const f of ['progression.js','batches.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);console.log(vm.runInContext('JSON.stringify(preparePersonalBatches(personalBatches.b,60))',c));"
app_fit = json.loads(subprocess.check_output(['node','-e',app_fit_script],cwd=ROOT,text=True))
output = {'bonus_assumption': 'User confirmed Adventurer Badge +20%; historical bonus is unknown.',
          'objective': 'Squared error in per-batch recipe counts, before rounding.',
          'historical_q': q, 'historical_cost_at_75': c75,
          'diagnostics': diagnostics, 'historical_candidates': historical_candidates,
          'personal_candidates': models, 'production_personal_fit': app_fit}
(ROOT/'analysis/personal-analysis.json').write_text(json.dumps(output, indent=2)+'\n')

lines = [
    '# Current Finder B formula investigation', '',
    'Reproduce: `python analysis/analyze_personal.py`. The analysis script reads current inputs without editing them. During this investigation the user confirmed the last three recipe counts as 4, 8 and 9; those corrections are now in `batches.js`.', '',
    '## Finding', '',
    'The historical curve is extremely close to geometric growth of XP requirements at integer skill levels, with linear progress inside each level. After the confirmed count corrections, the personal batches support this shape too, at approximately 1.92 times the historical XP rate. The badge explains a factor of 1.20; the remaining factor of about 1.60 is not identified by these observations.', '',
    'The user confirmed the Adventurer Badge grants +20%. The historical bonus is unknown, so dividing the historical cost by 1.20 assumes an unboosted historical baseline. A multiplier inferred from progress combines every difference in conditions; it does not identify the item effect.', '',
    '## Formula supported by the historical data', '',
    'Let `L` be integer skill, `p` the displayed percentage divided by 100, and `b` a relative XP bonus:', '',
    '```text',
    f'q = {q:.9f}', f'C75 = {c75:.9f} historical recipes per whole level at skill 75',
    'F(L,p) = C75 * ((q^(L-75)-1)/(q-1) + p*q^(L-75))',
    'recipes = ceil((F(target)-F(current))/(1+b))', '```', '',
    'Apply `1+b` only when comparing with an otherwise identical unboosted baseline. Personal measurements already include their active bonuses. Absolute XP and recipe XP cannot be separated from these observations.', '',
    '## Every recorded batch', '',
    '| Before → after | Recorded recipes | Historical prediction | With +20% | Required XP multiplier | Recipes at first-batch rate |',
    '|---|---:|---:|---:|---:|---:|',
]
for d in diagnostics:
    r = d['batch']
    lines.append(f"| {skill(r['before']):.4f} → {skill(r['after']):.4f} | {r['crafts']} | {d['historical_recipes']:.4f} | {d['conditional_bonus_20_recipes']:.4f} | {d['required_multiplier']:.4f}× | {d['recipes_at_first_batch_rate']:.4f} |")
lines += ['', 'The first two rows independently imply almost the same multiplier (about 1.92×). That is an effective rate relative to the old data, not evidence of a 92% item bonus.', '',
          'The last three gains resemble 4.06, 7.94 and 9 recipes at that rate, consistent with the user-confirmed 4, 8 and 9. The middle two together resemble 12. A hypothetical shared checkpoint near 76 + 15.93% instead of 16.93% would explain the small opposing residuals, but that percentage was NOT confirmed and remains unchanged. This residual exceeds two-decimal display rounding alone.', '',
          '## Eight historical model families', '',
          'Historical validation omits one interior checkpoint. Personal comparisons below use the last four rows as written; the best multiplier is fitted on those same rows and is not validation.', '',
          '| Model | Historical held-out MAE | Best common XP multiplier | Personal batch RMSE |',
          '|---|---:|---:|---:|']
for name, r in historical_candidates.items():
    lines.append(f"| {name} | {r['historical_held_out_mae']:.4f} | {r['best_constant_multiplier']:.4f} | {r['best_constant_rmse']:.4f} |")
lines += ['', 'Quadratic historical fits can be non-monotone and are unsuitable for recipe counting. Piecewise interpolation passes through measurements by construction; that is not evidence of a predictive game formula.', '',
          '## Fit the current batches directly', '',
          'These fits minimize per-batch errors, unlike the app’s cumulative-checkpoint fit. Leave-one-batch-out checks reuse neighboring checkpoints, so they are diagnostics, not independent replication. Forward prediction fits only the preceding batches.', '',
          f"| Model (last four) | q | Training RMSE | Leave-one-out MAE | Predicted last batch (actual {rows[-1]['observed']}) | At search boundary |",
          '|---|---:|---:|---:|---:|---|']
for name, subsets in models.items():
    r = subsets['last_four']
    lines.append(f"| {name} | {r['q']:.4f} | {r['rmse']:.4f} | {r['leave_one_batch_out_mae']:.4f} | {r['last_batch_forward_prediction']:.4f} | {r['boundary']} |")
lines += ['', 'Allowing negative curvature is a diagnostic, not a reason to prefer decreasing costs. With the corrected counts, the fitted shape supports increasing level costs. Four recent batches remain a small sample; exact game XP thresholds are not proven.', '',
          '## Calculator changes', '',
          'Previously a target of 80 fell outside the personal range ending at 78.4304 and silently selected the historical curve. The app now uses integer-level XP costs for both historical and personal fitted models. Historical fallback retains its original, unknown bonus conditions; no universal 1.92 multiplier is applied to other characters or recipes.', '',
          'Within measured personal intervals, the fitted exponential XP coordinate is interpolated between adjacent measured recipe totals. This preserves every recorded batch count exactly. After the final checkpoint, the forecast uses the fitted curve anchored to that checkpoint. The personal scale already includes the Adventurer Badge; dividing it by 1.20 again would double-count the bonus.', '',
          'A personal forecast requires at least three consecutive batches and no more than 5% relative error on any fitted batch. It is limited to the next rank, at most one observed skill-span past the last measurement, and skill 100. The UI labels forecasts explicitly. This consistency gate is a practical heuristic, not statistical proof of predictive accuracy.', '',
          f"Production fit: A = {app_fit['model']['a']:.9f}, k = {app_fit['model']['k']:.9f}, q = {math.exp(app_fit['model']['k']):.9f}, s0 = {skill(rows[0]['batch']['before']):.4f}.", '',
          'For the confirmed data, 78 + 43.04% to 80 gives **17 recipes**, 170 Finders, 28 h 20 min sequential time and 122 Diamond Dust. The historical shape calibrated only to the first batch also gives 17; the uncalibrated historical model gives 31 and a badge-only correction gives 26. This is a conditional forecast under the same crafting conditions, not a guaranteed exact game formula.', '',
          'Validation: synthetic parameter recovery and level-boundary checks in this script; historical held-out checkpoint comparisons; direct personal batch fits and held-out diagnostics; application tests for exact personal totals, forecast bounds, all four languages and rejection of the original inconsistent counts.', '']
(ROOT/'analysis/personal-analysis.md').write_text('\n'.join(lines), encoding='utf-8')
print('Wrote analysis/personal-analysis.md and analysis/personal-analysis.json. Numerical checks passed.')
