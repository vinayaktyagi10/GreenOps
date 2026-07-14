# 06 — AI Module Design

Two distinct AI components, serving different purposes. Neither is decorative — the forecasting model directly drives scheduling decisions (it is load-bearing), and the LLM module produces the report artifact judges will read.

---

## 1. Carbon Intensity Forecasting Model

### 1.1 Purpose
Reactive scheduling (only looking at *current* carbon intensity) misses an important case: a region that's dirty right now but about to turn clean in 20 minutes should be preferred over a region that's clean now but trending dirtier. Forecasting is what lets the scheduler make genuinely forward-looking decisions — this is the stated technical differentiator for this project.

### 1.2 Model
- **Primary**: [Prophet](https://facebook.github.io/prophet/) (additive model with daily + weekly seasonality), one model trained per region.
- **Features/inputs**: historical `carbon_intensity_gco2_kwh` time series from `CARBON_READINGS`, timestamped. Prophet handles seasonality natively without manual feature engineering — appropriate given time constraints.
- **Fallback**: if Prophet fails to converge or install issues arise close to the deadline, fall back to a simple weighted moving average blended with a same-hour-yesterday seasonal component (`0.6 * recent_trend + 0.4 * same_hour_last_day`). This must be implemented from day 1 as the safety net, with Prophet as the upgrade — never ship only the complex path untested.
- **Horizon**: next 24 hours, hourly granularity.
- **Retraining cadence**: on startup (from seeded historical data — see below) and every simulated hour thereafter as new readings accumulate.

### 1.3 Training Data Bootstrap
Electricity Maps' free tier gives limited historical depth via live polling alone. Bootstrap each region's history by:
1. Polling Electricity Maps' historical/past-range endpoint (if available on the free tier) for as much backfill as allowed, OR
2. If historical access is restricted, pre-collect real data for ~1-2 weeks in the run-up to the deadline (start ASAP — this is a Week 1 task, not Week 3) and/or synthesize a realistic seasonal pattern (diurnal solar/wind curve) calibrated to match the real API's current-value range, clearly labeled as synthetic in `CARBON_READINGS.source`.

This is the single most time-sensitive dependency in the whole project — **start Electricity Maps signup and historical data collection on day 1**.

### 1.4 Evaluation
- Hold out the most recent 20% of collected history as a test set.
- Metric: MAPE (Mean Absolute Percentage Error) against actual readings. Target < 15% per PRD.
- Report both Prophet and fallback model MAPE — if Prophet doesn't clearly beat the fallback, ship the fallback; simplicity that works beats complexity that's shaky live.

### 1.5 Output Contract
Written to `FORECASTS` table: `(region_id, target_time, predicted_gco2_kwh, lower_bound, upper_bound, model_version, generated_at)`. The Policy Engine reads the point estimate plus confidence bounds — wide bounds reduce the model's influence on the decision (i.e., an uncertain forecast shouldn't override a confident current reading).

### 1.6 How Forecasting Feeds the Policy Engine
```
score(region, t) = w1 * normalize(current_intensity[region])
                  + w2 * normalize(forecast_trend[region])   # is it getting cleaner or dirtier over the job's deferral window?
                  - w3 * urgency_penalty(job, t)              # closeness to deadline reduces willingness to wait
```
Weights (`w1, w2, w3`) are config, tunable during rehearsal against the replayed dataset to produce visibly good decisions for the demo — this tuning pass is itself part of the Week 3 rehearsal plan.

---

## 2. LLM Sustainability Narrative Module

### 2.1 Purpose
Translate the raw `SCHEDULING_DECISIONS` + `CARBON_BUDGETS` numbers into a short, readable report a non-engineer (or a judge skimming quickly) can understand in one read — the "so what" of the whole system.

### 2.2 Model
Anthropic Claude API (e.g. `claude-sonnet-5` — cost/latency appropriate for short, infrequent report generation; no need for a larger model here).

### 2.3 Input Schema (constructed server-side, not free text)
```json
{
  "period_start": "2026-07-30T00:00:00Z",
  "period_end": "2026-07-30T06:00:00Z",
  "total_jobs_scheduled": 42,
  "jobs_deferred": 17,
  "jobs_region_shifted": 9,
  "total_co2_saved_g": 18400,
  "total_cost_saved_usd": 3.10,
  "baseline_co2_g": 61200,
  "per_namespace": [
    {"namespace": "team-a", "budget_kg": 5.0, "consumed_kg": 3.2, "co2_saved_g": 9100}
  ],
  "notable_decisions": [
    {"job_id": "batch-report-42", "action": "deferred 3h", "reason": "us-east forecast to drop 40% by 02:00"}
  ]
}
```
This is the exact same data already in `SCHEDULING_DECISIONS`/`CARBON_BUDGETS` — no separate data pipeline, just an aggregation query.

### 2.4 Prompt Template (fixed, not dynamically constructed by an LLM)
```
System: You are writing a concise sustainability report for an engineering/ops audience.
Use only the numbers provided. Do not invent figures. 150-250 words.
Structure: (1) headline savings number, (2) one sentence on how it was achieved
(deferral vs. region-shifting), (3) any namespace nearing budget, (4) one notable
specific decision as a concrete example.

User: <JSON input as above>
```

### 2.5 Output Contract
Plain text (150-250 words), stored in `REPORTS.narrative` alongside the numeric fields it was grounded in. The dashboard displays the numbers and the narrative side by side — this makes it trivially auditable ("does the sentence match the number") rather than a black box, which matters for judge trust.

### 2.6 Evaluation
Manual read-through against 3-5 generated reports during Week 3 rehearsal: check for (a) no hallucinated numbers (cross-check against input JSON), (b) reads naturally, (c) stays in word budget. This is a demo-facing artifact, not a metric-driven ML component — qualitative review is sufficient and appropriate.

### 2.7 Failure Handling
If the Claude API is unavailable during the live demo (network issues), fall back to a **template-based** narrative (string-formatted from the same JSON, no LLM call) so the dashboard never shows an error state to judges. This fallback should be built and tested alongside the LLM path from the start, not bolted on at the end.
