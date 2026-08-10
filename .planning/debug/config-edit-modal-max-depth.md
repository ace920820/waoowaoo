---
status: resolved
trigger: SettingsModal (ConfigEditModal.tsx:171) throws "Maximum update depth exceeded" — setState inside useEffect loop
created: 2026-08-10
updated: 2026-08-10
---

# Debug: ConfigEditModal Maximum Update Depth

## Symptoms

- Expected: Settings modal opens and stays responsive.
- Actual: Console floods `Maximum update depth exceeded` from `ConfigEditModal.tsx:171` — the effect repeatedly calls `setLocalMoodPresets(storyboardMoodPresets)` because the prop reference changes on every parent render while the effect dependency is that same prop.

## Evidence

- `ConfigEditModal.tsx:170-172`: `useEffect(() => setLocalMoodPresets(storyboardMoodPresets), [storyboardMoodPresets])`
- Prop chain: `WorkspacePage` → `NovelPromotionWorkspace` (`vm.project.storyboardMoodPresets`) → `useWorkspaceProjectSnapshot` (`normalizeStoryboardMoodPresets(projectData?.storyboardMoodPresets)`)
- `normalizeStoryboardMoodPresets` (`src/lib/storyboard-mood-presets.ts:84`) **always returns a fresh array** (`input.map(...)` or `DEFAULT.map((p) => ({...p}))`), so whenever the snapshot `useMemo` recomputes (e.g. React Query refetch producing a new `project.novelPromotionData` / `episode?.storyboards` reference), the prop reference changes even when the values are identical → effect setState → re-render → loop.

## Resolution

- root_cause: Props→state sync effect compared only the array reference, but upstream normalizes the array to a new reference on each snapshot recompute; React re-renders forever because the "new" state never equals the previous reference.
- fix: Guard the sync with a value comparison (id/label/prompt per element) and keep the previous state when the contents are equal; only adopt the prop when the values actually differ.
- verification: typecheck clean; targeted lint clean.
- files_changed: src/components/ui/config-modals/ConfigEditModal.tsx
