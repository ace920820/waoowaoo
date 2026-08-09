---
status: investigating
trigger: "Prompt analysis shows no keyframe images after SceneDetect analysis"
created: 2026-08-09
updated: 2026-08-09
---

# Keyframe Images Missing

## Symptoms

- Expected: analyzed current shots expose Start/Middle/End thumbnails in Prompt analysis.
- Actual: 48 persisted shots render "无关键帧" and Prompt shows 0/48 eligible.
- Reproduction: upload a video, run SceneDetect analysis, then open Prompt analysis.

## Current Focus

- hypothesis: analysis import stores image URLs but does not persist platform media references required by the Prompt eligibility gate.
- next_action: prove the persistence gap with tests and repair the analysis/backfill path.
