---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 0
total_count: 3
last_updated: 2026-08-09T04:05:02.992Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 07 | unrun-verify | tests/integration/remake-projects/prompt-service.test.ts |  | Isolated MySQL transaction verification could not run because the configured Docker socket was unavailable. | open |  | 2026-08-08T16:53:29.172Z |  |
| 2 | 07 | deviation | tsconfig.json |  | Excluded preserved standalone Prompt prototype from root TypeScript compilation. | open |  | 2026-08-09T04:05:02.923Z |  |
| 3 | 07 | deviation | vitest.config.ts |  | Enabled Vitest discovery for existing tsx workbench contracts. | open |  | 2026-08-09T04:05:02.992Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "07",
    "file": "tests/integration/remake-projects/prompt-service.test.ts",
    "line": null,
    "description": "Isolated MySQL transaction verification could not run because the configured Docker socket was unavailable.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-08T16:53:29.172Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "07",
    "file": "tsconfig.json",
    "line": null,
    "description": "Excluded preserved standalone Prompt prototype from root TypeScript compilation.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-09T04:05:02.923Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "07",
    "file": "vitest.config.ts",
    "line": null,
    "description": "Enabled Vitest discovery for existing tsx workbench contracts.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-09T04:05:02.992Z",
    "resolved_at": null
  }
]
````
