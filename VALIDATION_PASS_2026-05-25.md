# Validation Baseline

The private source workspace previously reached a broad milestone validation pass.

For the public OSS release line, that historical pass is evidence of project maturity, but it is not enough. Public release readiness depends on checks that run from this repository alone.

## Public Baseline To Reproduce

From `jeju-radar-ui`:

```powershell
npm ci
npm audit --audit-level=moderate
npm run build
npm run verify:public
```

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_coordinate_authority.ps1
```

From `phraseology_contract`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_phraseology_contract.ps1
node scripts\verify-parser.mjs
node scripts\verify-response-policy.mjs
node scripts\verify-voice-tolerance-cases.mjs
```

Passing these checks means the public training simulator contracts are internally consistent. It does not mean the project is operational, certified, or suitable for real-world air traffic control.
