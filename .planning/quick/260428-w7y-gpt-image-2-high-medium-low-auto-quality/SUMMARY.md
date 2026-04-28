# Quick Summary: GPT Image 2 Quality Aliases

## Completed
- Added `gpt-image-2-high`, `gpt-image-2-medium`, `gpt-image-2-low`, and `gpt-image-2-auto` alias support.
- Non-template OpenAI-compatible image generation/edit now sends upstream `model: gpt-image-2` and alias-derived `quality`.
- Template-based OpenAI-compatible image generation renders aliases as upstream `gpt-image-2` plus `quality`.
- API config GET injects disabled alias presets for OpenAI-compatible providers, including a default template that carries `quality`.

## Validation
- `npx vitest run tests/unit/generators/openai-compatible-image.test.ts tests/unit/model-gateway/openai-compat-template-image-output-urls.test.ts tests/integration/api/specific/user-api-config-put.test.ts`
- `npm run typecheck`

## Notes
- Existing saved `gpt-image-2` remains unchanged; users can enable the new aliases from the API config model list.

## Follow-up Fix
- Fixed API config save failure after enabling quality aliases: `{{quality}}` is now an allowed OpenAI-compatible template placeholder.
- Added a PUT regression covering an enabled `gpt-image-2-high` model with `quality: "{{quality}}"` in the saved template.

## Follow-up Fix 2
- Fixed `OPENAI_COMPAT_IMAGE_TEMPLATE_OUTPUT_NOT_FOUND` for successful OpenAI-compatible image responses that return `data[0].b64_json` instead of `data[0].url`.
- Template image generation now returns both `imageBase64` and a `data:image/png;base64,...` `imageUrl`, which existing workers can upload to storage.
