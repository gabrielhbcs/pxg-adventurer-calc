# Current Finder B formula investigation

Reproduce: `python analysis/analyze_personal.py`. The analysis script reads current inputs without editing them. During this investigation the user confirmed the last three recipe counts as 4, 8 and 9; those corrections are now in `batches.js`.

## Finding

The historical curve is extremely close to geometric growth of XP requirements at integer skill levels, with linear progress inside each level. After the confirmed count corrections, the personal batches support this shape too, at approximately 1.92 times the historical XP rate. The badge explains a factor of 1.20; the remaining factor of about 1.60 is not identified by these observations.

The user confirmed the Adventurer Badge grants +20%. The historical bonus is unknown, so dividing the historical cost by 1.20 assumes an unboosted historical baseline. A multiplier inferred from progress combines every difference in conditions; it does not identify the item effect.

## Formula supported by the historical data

Let `L` be integer skill, `p` the displayed percentage divided by 100, and `b` a relative XP bonus:

```text
q = 1.194017995
C75 = 10.321963225 historical recipes per whole level at skill 75
F(L,p) = C75 * ((q^(L-75)-1)/(q-1) + p*q^(L-75))
recipes = ceil((F(target)-F(current))/(1+b))
```

Apply `1+b` only when comparing with an otherwise identical unboosted baseline. Personal measurements already include their active bonuses. Absolute XP and recipe XP cannot be separated from these observations.

## Every recorded batch

| Before → after | Recorded recipes | Historical prediction | With +20% | Required XP multiplier | Recipes at first-batch rate |
|---|---:|---:|---:|---:|---:|
| 74.4223 → 75.2602 | 4 | 7.6798 | 6.3999 | 1.9200× | 4.0000 |
| 75.2602 → 75.4462 | 1 | 1.9199 | 1.5999 | 1.9199× | 1.0000 |
| 75.4462 → 76.1693 | 4 | 7.8029 | 6.5024 | 1.9507× | 4.0641 |
| 76.1693 → 77.3397 | 8 | 15.2370 | 12.6975 | 1.9046× | 7.9361 |
| 77.3397 → 78.4304 | 9 | 17.2794 | 14.3995 | 1.9199× | 8.9999 |

The first two rows independently imply almost the same multiplier (about 1.92×). That is an effective rate relative to the old data, not evidence of a 92% item bonus.

The last three gains resemble 4.06, 7.94 and 9 recipes at that rate, consistent with the user-confirmed 4, 8 and 9. The middle two together resemble 12. A hypothetical shared checkpoint near 76 + 15.93% instead of 16.93% would explain the small opposing residuals, but that percentage was NOT confirmed and remains unchanged. This residual exceeds two-decimal display rounding alone.

## Eight historical model families

Historical validation omits one interior checkpoint. Personal comparisons below use the last four rows as written; the best multiplier is fitted on those same rows and is not validation.

| Model | Historical held-out MAE | Best common XP multiplier | Personal batch RMSE |
|---|---:|---:|---:|
| linear | 16.6818 | 0.6063 | 0.8742 |
| power2 | 15.8145 | 0.6848 | 0.8112 |
| power3 | 14.8543 | 0.7696 | 0.7483 |
| power | 0.3534 | 1.9092 | 0.0987 |
| quadratic | 3.7950 | 1.8239 | 0.4914 |
| exponential | 0.0442 | 1.9047 | 0.0790 |
| discrete_exponential | 0.0005 | 1.9170 | 0.0442 |
| piecewise | 2.3662 | 1.9633 | 0.0297 |

Quadratic historical fits can be non-monotone and are unsuitable for recipe counting. Piecewise interpolation passes through measurements by construction; that is not evidence of a predictive game formula.

## Fit the current batches directly

These fits minimize per-batch errors, unlike the app’s cumulative-checkpoint fit. Leave-one-batch-out checks reuse neighboring checkpoints, so they are diagnostics, not independent replication. Forward prediction fits only the preceding batches.

| Model (last four) | q | Training RMSE | Leave-one-out MAE | Predicted last batch (actual 9) | At search boundary |
|---|---:|---:|---:|---:|---|
| linear | 1.0000 | 0.8742 | 1.0819 | 7.0409 | False |
| continuous_increasing_cost | 1.1987 | 0.0762 | 0.2396 | 9.5052 | False |
| discrete_increasing_cost | 1.1963 | 0.0433 | 0.1335 | 9.2858 | False |
| continuous_allow_decreasing_cost | 1.1987 | 0.0762 | 0.2396 | 9.5052 | False |
| discrete_allow_decreasing_cost | 1.1963 | 0.0433 | 0.1335 | 9.2858 | False |

Allowing negative curvature is a diagnostic, not a reason to prefer decreasing costs. With the corrected counts, the fitted shape supports increasing level costs. Four recent batches remain a small sample; exact game XP thresholds are not proven.

## Calculator changes

Previously a target of 80 fell outside the personal range ending at 78.4304 and silently selected the historical curve. The app now uses integer-level XP costs for both historical and personal fitted models. Historical fallback retains its original, unknown bonus conditions; no universal 1.92 multiplier is applied to other characters or recipes.

Within measured personal intervals, the fitted exponential XP coordinate is interpolated between adjacent measured recipe totals. This preserves every recorded batch count exactly. After the final checkpoint, the forecast uses the fitted curve anchored to that checkpoint. The personal scale already includes the Adventurer Badge; dividing it by 1.20 again would double-count the bonus.

A personal forecast requires at least three consecutive batches and no more than 5% relative error on any fitted batch. It is limited to the next rank, at most one observed skill-span past the last measurement, and skill 100. The UI labels forecasts explicitly. This consistency gate is a practical heuristic, not statistical proof of predictive accuracy.

Production fit: A = 24.598631568, k = 0.179458496, q = 1.196569241, s0 = 74.4223.

For the confirmed data, 78 + 43.04% to 80 gives **17 recipes**, 170 Finders, 28 h 20 min sequential time and 122 Diamond Dust. The historical shape calibrated only to the first batch also gives 17; the uncalibrated historical model gives 31 and a badge-only correction gives 26. This is a conditional forecast under the same crafting conditions, not a guaranteed exact game formula.

Validation: synthetic parameter recovery and level-boundary checks in this script; historical held-out checkpoint comparisons; direct personal batch fits and held-out diagnostics; application tests for exact personal totals, forecast bounds, all four languages and rejection of the original inconsistent counts.
