---
status: complete
phase: 02-multi-shot-fast-path
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-VERIFICATION.md]
started: 2026-04-19T04:00:00Z
updated: 2026-04-19T04:06:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Multi-Shot Confirmation Label
expected: 进入 `multi_shot` 剧集的确认步骤后，顶部 capsule 导航的当前步骤应该显示成一个专门的“多镜头确认”步骤，而不是通用的 “storyboard / 分镜” 文案。
result: pass

### 2. Confirmation Review Flow With Real Assets
expected: 点击“确认并开始绘制”后，应先停在多镜头确认步骤；此时不会直接开始视频生成；每个片段都能在确认页里执行参考图相关操作（上传、生成或替换/重传），确认完成后再继续进入 `videos`。
result: issue
reported: "不对，在我输入的故事生成剧本之后，在剧本子页面，我点击了多镜头片段模式确认并开始绘制。然后子页面就重新跳回了故事子页面，正常应该跳到分镜子页面，让我可以看到剧本下的两个片段，应该被切成8个多镜头分镜小片段。一集是2分钟的内容，分成片段一和片段二，每个片段应该对应四个多镜头小片段。现在我能看到，在成片子页面，被粗暴的分成了两个多镜头片段，分别是片段一的内容和片段二的内容，而没有做精细的切分。并且分镜子页面，我也没有办法点进去，也不能上传或生成参考图，以及进一步生成分镜参考表的图"
severity: major

## Summary

total: 2
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "点击“确认并开始绘制”后，应先停在多镜头确认步骤；此时不会直接开始视频生成；每个片段都能在确认页里执行参考图相关操作（上传、生成或替换/重传），确认完成后再继续进入 `videos`。"
  status: failed
  reason: "User reported: 不对，在我输入的故事生成剧本之后，在剧本子页面，我点击了多镜头片段模式确认并开始绘制。然后子页面就重新跳回了故事子页面，正常应该跳到分镜子页面，让我可以看到剧本下的两个片段，应该被切成8个多镜头分镜小片段。一集是2分钟的内容，分成片段一和片段二，每个片段应该对应四个多镜头小片段。现在我能看到，在成片子页面，被粗暴的分成了两个多镜头片段，分别是片段一的内容和片段二的内容，而没有做精细的切分。并且分镜子页面，我也没有办法点进去，也不能上传或生成参考图，以及进一步生成分镜参考表的图"
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
