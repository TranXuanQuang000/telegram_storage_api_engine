# Test report

Date: 2026-07-23

## Automated checks

- `npx tsc --noEmit`: pass.
- `npm run lint`: pass with 0 warnings.
- `npm test`: pass; production build plus 6/6 tests.
- `npm audit`: pass; 0 known vulnerabilities.

Coverage includes rating aggregation/deduplication/bounds, missing-rating behavior, auto-tags/content rating, server-rendered home, anonymous public routes, invalid reader input and missing AI configuration.

## Browser and responsive QA

- Desktop home 1440×900: pass, no horizontal overflow.
- Mobile home 390×844: pass, no overflow; primary controls meet touch-target baseline.
- Tablet discovery 768×1024: pass; two-column results and working tri-state filters.
- Desktop story 1440×900: pass; live AniList/Kitsu sources visible and clickable.
- Mobile reader 390×844: pass; chapter images load, controls remain usable and offline download completed.
- Browser console: 0 errors, 0 warnings after the final pass.

## Visual Quality Gate

Score: **92/100** — pass (required: 85).

- Hierarchy: 24/25
- Consistency: 19/20
- Responsive behavior: 19/20
- Originality: 15/15
- Interaction polish: 15/15

