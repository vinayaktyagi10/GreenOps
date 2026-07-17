# 06. AI module design

There are two distinct AI components serving different purposes. Neither is decorative: the forecasting model directly drives scheduling decisions, and the LLM module produces the report artifact judges will read.

---

## 1. Carbon intensity forecasting model

### 1.1 Purpose
Reactive scheduling, meaning only looking at current carbon intensity, misses an important case: a region that's dirty right now but about to turn clean in 20 minutes should be preferred over a region that's clean now but trending dirtier. Forecasting is what lets the scheduler make genuinely forward-looking decisions, and it's the project's main technical differentiator.

### 1.2 Model
The primary model is [Prophet](https://facebook.github.io/prophet/), an additive model with daily and weekly seasonality, trained separately per region. Its inputs are the historical `carbon_intensity_gco2_kwh` time series from `CARBON_READINGS`, timestamped. Prophet handles seasonality natively without manual feature engineering, which fits the time constraints here.

The fallback, used if Prophet fails to converge or install issues arise close to the deadline, is a simple weighted moving average blended with a same-hour-yesterday seasonal component (`0.6 * recent_trend + 0.4 * same_hour_last_day`). This is implemented from day one as the safety net, with Prophet as the upgrade; the complex path never ships untested on its own.

The forecast horizon is the next 24 hours at hourly granularity. Retraining happens on startup, from seeded historical data (see below), and every simulated hour after that as new readings accumulate.

### 1.3 Training data bootstrap
Electricity Maps' free tier gives limited historical depth via live polling alone. Each region's history is bootstrapped by polling Electricity Maps' historical range endpoint, if available on the free tier, for as much backfill as allowed. If historical access is restricted, the alternative is to pre-collect real data for one to two weeks in the run-up to the deadline (starting as early as possible, a Week 1 task, not Week 3), and/or synthesize a realistic seasonal pattern (a diurnal solar/wind curve) calibrated to match the real API's current-value range, clearly labeled as synthetic in `CARBON_READINGS.source`.

This is the single most time-sensitive dependency in the whole project: Electricity Maps signup and historical data collection should start on day one.

### 1.4 Evaluation
The most recent 20% of collected history is held out as a test set. The metric is MAPE (Mean Absolute Percentage Error) against actual readings, targeting under 15% per the PRD. Both Prophet's and the fallback model's MAPE are reported; if Prophet doesn't clearly beat the fallback, the fallback ships instead, since simplicity that works beats complexity that's shaky live.

### 1.5 Output contract
Results are written to the `FORECASTS` table: `(region_id, target_time, predicted_gco2_kwh, lower_bound, upper_bound, model_version, generated_at)`. The policy engine reads the point estimate plus confidence bounds. Wide bounds reduce the model's influence on the decision, so an uncertain forecast doesn't override a confident current reading.

### 1.6 How forecasting feeds the policy engine
```
score(region, t) = w1 * normalize(current_intensity[region])
                  + w2 * normalize(forecast_trend[region])   # is it getting cleaner or dirtier over the job's deferral window?
                  - w3 * urgency_penalty(job, t)              # closeness to deadline reduces willingness to wait
```
The weights (`w1, w2, w3`) are config values, tuned during rehearsal against the replayed dataset to produce visibly good decisions for the demo. This tuning pass is part of the Week 3 rehearsal plan.

---

## 2. LLM sustainability narrative module

### 2.1 Purpose
This translates the raw `SCHEDULING_DECISIONS` and `CARBON_BUDGETS` numbers into a short, readable report that a non-engineer, or a judge skimming quickly, can understand in one read.

### 2.2 Model
The Anthropic Claude API, for example `claude-sonnet-5`. Cost and latency are appropriate for short, infrequent report generation, so there's no need for a larger model here.

### 2.3 Input schema (constructed server-side, not free text)
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
This is the same data already in `SCHEDULING_DECISIONS`/`CARBON_BUDGETS`. There is no separate data pipeline, just an aggregation query.

### 2.4 Prompt template (fixed, not dynamically constructed by an LLM)
```
System: You are writing a concise sustainability report for an engineering/ops audience.
Use only the numbers provided. Do not invent figures. 150-250 words.
Structure: (1) headline savings number, (2) one sentence on how it was achieved
(deferral vs. region-shifting), (3) any namespace nearing budget, (4) one notable
specific decision as a concrete example.

User: <JSON input as above>
```

### 2.5 Output contract
Plain text, 150 to 250 words, stored in `REPORTS.narrative` alongside the numeric fields it was grounded in. The dashboard displays the numbers and the narrative side by side, so it's easy to check that the sentence matches the number rather than trusting a black box, which matters for judge trust.

### 2.6 Evaluation
A manual read-through against 3 to 5 generated reports during Week 3 rehearsal checks for no hallucinated numbers (cross-checked against the input JSON), natural phrasing, and staying within the word budget. This is a demo-facing artifact rather than a metric-driven ML component, so qualitative review is sufficient.

### 2.7 Failure handling
If the Claude API is unavailable during the live demo, for example due to network issues, the system falls back to a template-based narrative, string-formatted from the same JSON with no LLM call, so the dashboard never shows an error state to judges. This fallback is built and tested alongside the LLM path from the start, not added at the end.
