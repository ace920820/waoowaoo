# Prompt 前端交接包（给 AI Studio 用）

这个文件夹是给 **AI Studio（或其他 AI 编程工具）** 实现 Phase 7 前端页面的完整交接材料。
用法见 `00-给AI-Studio的主提示词.md`。

## 文件清单

| 文件 | 内容 | 用途 |
|---|---|---|
| `00-给AI-Studio的主提示词.md` | 主提示词模板 | **直接复制粘贴到 AI Studio 对话框** |
| `01-前端需求文档.md` | Phase 7 前端需求（10 步验收流程） | AI 实现的目标规格 |
| `02-现有工作台骨架.tsx` | RemakeWorkbench 完整源码 | AI 必须照此结构加 Prompt stage |
| `03-后端API-合同.md` | 已就绪的后端 API 说明 | AI 调用后端的方式 |
| `04-前端数据hooks-合同.md` | 已就绪的 React Query hooks | AI 获取数据的方式 |
| `05-设计系统与视觉风格.md` | 颜色/圆角/阴影/字体 token + 玻璃态说明 | AI 必须遵守的视觉规范 |
| `06-现有文案样例.json` | 现有中英文案（含 Prompt 全部 key） | AI 使用的文案键 |
| `07-可复用UI组件清单.md` | 现有 Glass 组件清单 | AI 优先复用，禁止重造 |
| `08-截图/` | 现有页面真实截图 | AI 的视觉参考 |

## 一句话说明

后端（数据表、Worker、API、hooks）**全部已就绪**。AI Studio 只负责：
1. 在 `RemakeWorkbench` 里加一个 `prompt` stage
2. 按 `01-前端需求文档.md` 实现图片/Video 两个 tab
3. 用 `03`/`04` 提供的 API 和 hooks 取数
4. 用 `05` 的设计 token + `07` 的 Glass 组件保持风格一致
