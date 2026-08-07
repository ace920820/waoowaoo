# Quick Task Summary — storyboard package result fields

- Fixed frontend storyboard-package preview/result display to surface shot-level `focalLength`, `dof`, and `lighting`.
- Added `focalLength` alias handling so packages using `focalLength` render as `焦段` instead of dropping back to generic `lens` values.
- Kept scope frontend-only: preview DTOs, minimal preview UI, and result prompt formatter compatibility.

## Validation
- `./node_modules/.bin/tsc --noEmit --pretty false`
- Bundled render check confirmed HTML contains `焦段 35mm`, `景深 中景景深`, `打光 办公室顶灯为主，屏幕补光形成脸部冷亮`.
- Bundled mapper check confirmed prompt contains `焦段=35mm`, `景深=中景景深`, `打光=办公室顶灯为主，屏幕补光形成脸部冷亮` and does not contain `焦段=Prime`.

## Notes
- `vitest` and `npm run typecheck` were blocked in this environment by macOS `SecItemCopyMatching failed -50` during tool startup / `prisma generate`.
