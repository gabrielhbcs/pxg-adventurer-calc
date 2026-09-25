"""Compare linear interpolation with a logarithmic progression hypothesis.

Run: python analysis/fit_progression.py
No external dependencies. Reads the existing checkpoints without changing them.
Model: n = A * (exp(k * (skill - initial_skill)) - 1).
Inverse: skill = initial_skill + log(1 + n / A) / k.
Fits minimize squared recipe-count errors, anchored at the first checkpoint.
Validation holds out each interior checkpoint; endpoints remain available.
"""
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'app.js').read_text(encoding='utf-8')


def fit(points):
    origin = points[0][0]

    def evaluate(k):
        weights = [math.expm1(k * (skill - origin)) for skill, _ in points]
        a = sum(w * n for w, (_, n) in zip(weights, points)) / sum(w*w for w in weights)
        error = sum((a*w - n)**2 for w, (_, n) in zip(weights, points))
        return error, a

    # Locate the best basin, then refine with golden-section minimization.
    grid = [0.000001 + i * 0.001 for i in range(1001)]
    best = min(range(len(grid)), key=lambda i: evaluate(grid[i])[0])
    lo, hi = grid[max(0, best-1)], grid[min(len(grid)-1, best+1)]
    ratio = (math.sqrt(5)-1)/2
    for _ in range(100):
        left, right = hi-ratio*(hi-lo), lo+ratio*(hi-lo)
        if evaluate(left)[0] < evaluate(right)[0]:
            hi = right
        else:
            lo = left
    k = (lo+hi)/2
    error, a = evaluate(k)
    return a, k, math.sqrt(error/len(points))


def predict(skill, origin, a, k):
    return a * math.expm1(k*(skill-origin))


def linear(points, skill):
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x0 <= skill <= x1:
            return y0 + (skill-x0)/(x1-x0)*(y1-y0)
    raise ValueError('Outside measured interval')


results = {}
for recipe in 'dcba':
    raw = json.loads(re.search(r'\b'+recipe+r':\{.*?points:(\[\[.*?\]\])', source)[1])
    points = [(skill+percent/100, n) for n, skill, percent in raw]
    a, k, rmse = fit(points)
    held_out = []
    for i in range(1, len(points)-1):
        training = points[:i]+points[i+1:]
        ai, ki, _ = fit(training)
        skill, actual = points[i]
        held_out.append({'skill':skill, 'actual_recipes':actual,
                         'linear_error':linear(training, skill)-actual,
                         'logarithmic_error':predict(skill, points[0][0], ai, ki)-actual})
    results[recipe.upper()] = {
        'checkpoints':len(points), 'initial_skill':points[0][0], 'A':a, 'k':k,
        'doubling_skill_interval':math.log(2)/k,
        'training_rmse_recipes':rmse,
        'validation_linear_mae_recipes':sum(abs(p['linear_error']) for p in held_out)/len(held_out),
        'validation_logarithmic_mae_recipes':sum(abs(p['logarithmic_error']) for p in held_out)/len(held_out),
        'residuals':[{'skill':s, 'actual_recipes':n, 'predicted_recipes':predict(s,points[0][0],a,k)} for s,n in points],
        'held_out':held_out,
    }

b = results['B']
example = predict(80,b['initial_skill'],b['A'],b['k'])-predict(73.4215,b['initial_skill'],b['A'],b['k'])
output={'model':'n = A * expm1(k * (skill - initial_skill))', 'recipes':results,
        'example_finder_b_73_4215_to_80':{'raw_recipes':example,'rounded_recipes':math.ceil(example)}}
target = ROOT / 'analysis' / 'progression-fit.json'
target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for name,r in results.items():
    print(f"{name}: A={r['A']:.6f}, k={r['k']:.6f}, fit RMSE={r['training_rmse_recipes']:.3f}, validation MAE linear={r['validation_linear_mae_recipes']:.3f}, log={r['validation_logarithmic_mae_recipes']:.3f}")
print(f'Finder B example: {example:.3f} -> {math.ceil(example)} recipes')
