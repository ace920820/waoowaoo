# Quick Plan: GPT Image 2 Quality Aliases

## Goal
Expose 智增增/OpenAI-compatible `gpt-image-2` as four selectable image models while all calls still use upstream `gpt-image-2` with the matching `quality` value.

## Scope
- Add alias mapping for `gpt-image-2-high|medium|low|auto`.
- Apply mapping to both OpenAI-compatible SDK image generation/edit and template-based image generation.
- Add disabled API-config presets for OpenAI-compatible providers so users can enable the four quality models.
- Add focused regressions for payload mapping and API-config presets.

## Non-Goals
- No database schema changes.
- No real upstream network calls.
- No generic quality dropdown UI.
