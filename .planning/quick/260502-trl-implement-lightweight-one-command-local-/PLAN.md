# Quick Task: Implement lightweight one-command local dev runner

## Scope
- Add repo-local `bin/waoowaoo` shell runner.
- Add optional user-level symlink installer under `scripts/`.
- Document safe symlink/global command setup in `README.md`.
- Preserve existing `npm run dev` flow and local data.

## Safety Constraints
- Do not Dockerize or alter package dev scripts.
- Do not start/stop/kill MySQL.
- Only stop app/Redis processes recorded by this tool after identity validation.
- Avoid duplicate app starts via PID and HTTP/port checks.
- Resolve symlinks so global invocation works from any current directory.
- Keep state and logs in user-level paths, with repo-local ignored fallback only when needed.

## Validation
- `bin/waoowaoo status`
- `bin/waoowaoo up --background` duplicate handling
- `bin/waoowaoo down`
- installer invocation from a non-project directory
- HTTP status checks for app and Bull Board when reachable
- Non-project cwd invocation
- `git status` / diff limited to expected task files
