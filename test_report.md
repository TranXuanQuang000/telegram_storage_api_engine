# Test report

Date: 2026-07-23

## Automated checks

- `npx tsc --noEmit`: pass.
- `npm run lint`: pass with 0 warnings.
- `npm test`: pass; production build plus 11/11 tests.
- `npm audit`: pass; 0 known vulnerabilities.

Coverage includes rating aggregation/deduplication/bounds, missing-rating behavior, auto-tags/content rating, Vietnamese title normalization and typo tolerance, AI reference-title extraction, server-rendered home, anonymous public routes, invalid reader input, missing AI configuration, full-cover/font contracts, reader chapter navigation and honest rating-sort/search-correction labels.

## Production-local performance

Measured against the Cloudflare-compatible production bundle on `127.0.0.1`:

- Home cold: TTFB 0.56s; complete stream 1.05s.
- Home warm: TTFB 0.04s; complete stream 0.52s.
- Typo search: TTFB 0.02s; complete stream 1.12s.
- Rating sort: TTFB 0.03s; complete stream 0.82s.
- Story detail: main content TTFB 0.70s; external ratings stream independently and completed at 5.42s.

The reader progress queue is debounced, deduplicated and stops retrying for anonymous 401/403 responses, eliminating the repeated progress-sync traffic observed before this pass.

## Browser and responsive QA

- Desktop home 1440×900: pass, no horizontal overflow.
- Mobile home 390×844: pass, no overflow; primary controls meet touch-target baseline.
- Tablet discovery 768×1024: pass; two-column results and working tri-state filters.
- Desktop story 1440×900: pass; live AniList/Kitsu sources visible and clickable.
- Mobile reader 390×844: pass; chapter images load, controls remain usable and offline download completed.
- Browser console: 0 errors, 0 warnings after the final pass.

The July improvement pass preserves the validated responsive structure while adding Vietnamese-specific fonts, transform/opacity motion with reduced-motion support, rating badges on covers, full-height cover enforcement and expanded reader chrome.

## Visual Quality Gate

Score: **92/100** — pass (required: 85).

- Hierarchy: 24/25
- Consistency: 19/20
- Responsive behavior: 19/20
- Originality: 15/15
- Interaction polish: 15/15
