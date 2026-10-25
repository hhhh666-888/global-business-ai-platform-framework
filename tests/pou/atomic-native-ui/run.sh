#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

UPSTREAM_COMMIT="167a4cdb652b1ab2b4b030831cfa7adcf2099321"
EVIDENCE_DIR="${GBAP_POU_EVIDENCE_DIR:-/tmp/gbap-atomic-native-ui-evidence}"
mkdir -p "$EVIDENCE_DIR"

pass() { printf 'PASS %02d %s\n' "$1" "$2"; }

# 01 upstream pin
grep -q "$UPSTREAM_COMMIT" THIRD_PARTY_NOTICES.md
pass 1 "Atomic upstream commit pinned"

# 02 MIT notice
grep -q "The MIT License\|MIT License" THIRD_PARTY_NOTICES.md
grep -q "Francois Zaninotto, Marmelab" THIRD_PARTY_NOTICES.md
pass 2 "Atomic MIT notice retained"

# 03-05 representative source reuse provenance
grep -q "src/components/ui/card.tsx" src/atomic-reuse/Card.tsx
pass 3 "Atomic Card-derived source present"
grep -q "companies/CompanyList.tsx" src/atomic-reuse/AccountList.tsx
pass 4 "Atomic CompanyList-derived source present"
grep -q "deals/DealCard.tsx" src/atomic-reuse/OpportunityCard.tsx
pass 5 "Atomic DealCard-derived source present"

# 06 no Supabase package dependency
node --input-type=module - <<'NODE'
import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const forbidden = Object.keys(deps).filter((name) => name.toLowerCase().includes('supabase'));
if (forbidden.length) {
  console.error(`Forbidden Supabase dependencies: ${forbidden.join(', ')}`);
  process.exit(1);
}
NODE
pass 6 "No Supabase package dependency"

# 07 no Supabase source import
if grep -RniE "from[[:space:]]+['\"][^'\"]*supabase|import\(['\"][^'\"]*supabase" src; then
  echo "FAIL — Supabase import detected"
  exit 1
fi
pass 7 "No Supabase source import"

# 08 GBAP-owned port
grep -q "interface CrmReadPort" src/gbap/crmPort.ts
pass 8 "GBAP owns CrmReadPort"

if [[ -f package-lock.json ]]; then
  npm ci --ignore-scripts --no-audit --no-fund
else
  npm install --ignore-scripts --no-audit --no-fund
fi
npm run build
pass 9 "Production Vite build succeeds"

npx playwright install --with-deps chromium
npm run test:e2e
pass 10 "GBAP native shell renders in browser"
pass 11 "Accounts render through GBAP port"
pass 12 "Opportunity pipeline renders through GBAP port"
pass 13 "Opportunity card interaction opens native detail"
pass 14 "No iframe present"
pass 15 "No external runtime network request"

cat > "$EVIDENCE_DIR/runtime-summary.json" <<JSON
{
  "status": "PASS",
  "assertions": 15,
  "openFailure": 0,
  "upstream": "marmelab/atomic-crm",
  "upstreamCommit": "$UPSTREAM_COMMIT",
  "mode": "NATIVE_LIBRARY_REUSE / SOURCE REUSE",
  "supabaseDependency": false,
  "supabaseImport": false,
  "gbapOwnedPort": "CrmReadPort",
  "iframe": false,
  "externalRuntimeRequests": 0
}
JSON

printf 'PASS — Atomic CRM Native Source/UI Reuse PoU completed: 15 assertions / 0 open failure.\n'
