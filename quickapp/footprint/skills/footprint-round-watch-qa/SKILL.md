---
name: footprint-round-watch-qa
description: Use when changing Footprint Vela pages for a 466x466 round watch, especially when circular safe-area clipping, Recovery layout, swipe navigation, or round-screen regressions are reported.
---

# Verifying Footprint Round-Watch Changes

Use this skill before calling a Footprint circular-watch UI change complete. Its core rule is: a visual adjustment is not verified until the round-screen structure and the targeted regressions both pass.

## Scope

- Project root: `quickapp/footprint`.
- The round baseline is `config-watch.json` with `designWidth: 466`.
- Keep the existing design variables; do not change square-screen styles merely to repair the round view.
- Treat GNSS, heart rate, phone connection, and sync values in the simulator as Demo/Test data unless a device test proves otherwise.

## Run the verifier

From `quickapp/footprint`:

```powershell
node skills/footprint-round-watch-qa/scripts/check-round-watch.mjs .
node skills/footprint-round-watch-qa/scripts/check-round-watch.mjs . --run
```

The first command checks the 466 baseline, Recovery page's `screen-round` and `fit-round` markers, non-scrollable root, and presence of the relevant regression tests. The second command also runs the round-layout, Recovery, history-delete, prematch-stability, and vertical-balance tests.

## Interpreting a failure

| Failure | Required response |
| --- | --- |
| `designWidth must be 466` | Do not use this Skill's sizing baseline; restore the intended device configuration or create a different device-specific check. |
| Recovery class failure | Apply the existing `.round` mechanism at the Recovery root and safe content column; do not paper over clipping by shrinking unrelated global styles. |
| Regression test failure | Fix the named page or state behavior, then run the verifier again. |

## Delivery boundary

Run `npm test` after behavior changes and `npm run build` when an RPK is required. A successful build proves only that an RPK was generated; it does not prove physical device sensors or a real match session.
