## Summary

-

## Verification

Run UI commands from `jeju-radar-ui/`.

- [ ] `npm audit --audit-level=moderate`
- [ ] `npm run build`
- [ ] `npm run verify:public`
- [ ] Coordinate authority verification, if data authority changed
- [ ] Phraseology contract verification, if phraseology/parser/response policy changed

## Public Boundary Review

- [ ] No secrets, credentials, `.env` files, or API keys
- [ ] No private SOPs, PDFs, training manuals, tacit notes, or local-only evidence
- [ ] No generated folders such as `node_modules`, `dist`, `build`, `output`, `tmp`, or synced `public`
- [ ] No oversized raw geometry such as `data/geometry/coastline_lines.geojson`
- [ ] No operational ATC, navigation, dispatch, certification, or safety-critical claim

## Data Authority

- [ ] Data authority labels are preserved or updated where needed
- [ ] Exact, derived, training, reference-only, visual-only, and blocked data are not mixed
