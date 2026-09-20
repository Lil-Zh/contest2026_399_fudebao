# 466×466 圆屏赛前检查页 Design QA

- Source visual truth: `C:\Users\16116\AppData\Local\Temp\codex-clipboard-0337abc2-499d-4544-8ec7-515bfc149b1f.png`
- Initial implementation evidence: `C:\Users\16116\AppData\Local\Temp\codex-clipboard-d33e286c-52ed-42a9-91ef-61153d583f74.png`
- Final implementation screenshot: `E:\Openvela大赛\.temp_screens\prematch-final-v2-early.png`
- Stability screenshot: `E:\Openvela大赛\.temp_screens\prematch-final-v2-late.png`
- Final comparison input: `E:\Openvela大赛\.temp_screens\prematch-design-qa-final.png`
- Viewport: 466 × 466 px, round OpenVELA simulator, AMOLED dark theme
- Source pixels: 1280 × 1280; normalized to 466 × 466 with high-quality bicubic scaling
- Implementation pixels / CSS viewport: 466 × 466 at simulator density
- State: phone connected, GNSS good, heart-rate ready, right goal selected

## Full-view comparison

The target and implementation were placed in one 932 × 466 comparison image. The final screen matches the target hierarchy and safe-area composition: centered readiness header, dominant field name, five aligned status rows, full-width divider/direction controls, narrower primary action, and centered page indicators.

## Focused-region comparison

The dense center and bottom control regions were checked separately because type size, icon alignment, row baselines, button width, and bottom clearance are the fidelity-critical details. Final measurements keep the status values aligned on the right edge and both persistent actions inside the circular safe area.

## Required fidelity surfaces

- Fonts and typography: hierarchy, weights, 30px field title, 15px status labels, 14px values, and 22px primary label align with the normalized target.
- Spacing and layout rhythm: static 336px safe column, centered 316px divider, 316px direction row, and 276px primary action match the reference proportions without clipping.
- Colors and tokens: AMOLED black, off-white hierarchy, yellow-green status/action color, gray secondary action, and semantic dots remain consistent with the supplied target.
- Image quality and assets: existing raster check/sensor/arrow assets are used; no placeholder or generated device chrome was added.
- Copy and content: all target labels and values are present. The deterministic simulator reports `±3.2 m` instead of the target sample `±3.0 m`; this is an acceptable live-data variation.

## Comparison history

1. P1: the original dynamic round subtree rendered as a narrow, left-anchored layout. Fixed by making Prematch a static round-first composition with direct Vela-supported classes.
2. P0: changing the sensor list from four to five rows caused the renderer to remove upper content. Fixed by using five stable row nodes and keeping storage visible independently of phone state.
3. P1: the first corrected layout remained visually undersized. Fixed by increasing the field title, row type/icons, divider width, direction controls, and primary action to the normalized reference scale.
4. P2: the first normalized comparison showed a narrow divider/direction row and an early bottom baseline. Fixed by widening the controls and restoring the measured vertical rhythm.
5. Post-fix evidence: early and 12-second-late captures are byte-identical (`SHA256 D004695AC3A2771581E1CF607294E9E126178701F579FF6CA066DA44F69EF658`), confirming the page no longer degrades while open.

## Interaction checks

- Left-goal selection changes to the yellow selected state.
- Right-goal selection restores the reference state.
- Start-match behavior remains covered by the project full-flow test.

## Remaining P3 polish

- Minor stroke-shape differences remain between the supplied reference icons and the project's existing raster sensor icons.
- The reference includes a decorative bezel; the implementation comparison intentionally evaluates app-owned screen content only.

final result: passed
