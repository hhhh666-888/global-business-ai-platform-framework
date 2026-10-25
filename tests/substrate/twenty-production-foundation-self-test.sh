#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="$ROOT/infrastructure/twenty-production/docker-compose.yml"
RUNTIME="$ROOT/infrastructure/twenty-production/runtime.env.example"
REGISTRATION="$ROOT/infrastructure/twenty-production/provider-registration.template.json"
README="$ROOT/infrastructure/twenty-production/README.md"
ADAPTER="$ROOT/providers/twenty-adapter/server.mjs"
ADAPTER_EXTENSION="$ROOT/providers/twenty-adapter/extended.mjs"
PASS_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '[PASS %02d] %s\n' "$PASS_COUNT" "$*"
}

fail() {
  printf '[FAIL] %s\n' "$*" >&2
  exit 1
}

for file in "$COMPOSE" "$RUNTIME" "$REGISTRATION" "$README" "$ADAPTER" "$ADAPTER_EXTENSION"; do
  [[ -f "$file" ]] || fail "required foundation file missing: $file"
done
pass "required Twenty production foundation files exist"

grep -Fq '${TWENTY_IMAGE:?set TWENTY_IMAGE' "$COMPOSE" || fail "Twenty image is not mandatory"
grep -Fq 'twentycrm/twenty@sha256:<approved-tested-digest>' "$RUNTIME" || fail "runtime contract does not require immutable Twenty digest"
pass "Twenty production image identity is immutable-digest governed"

if grep -Eq '^[[:space:]]*ports:' "$COMPOSE"; then
  fail "production Twenty compose must not publish host ports"
fi
grep -Fq 'internal: true' "$COMPOSE" || fail "private Twenty network is not internal"
pass "Twenty engine is not directly host-exposed and uses an internal private network"

if grep -Eq '^[[:space:]]*(POSTGRES_PASSWORD|PG_DATABASE_URL|ENCRYPTION_KEY|APP_SECRET|TWENTY_DATABASE_URL):' "$COMPOSE"; then
  fail "raw Twenty/database secret material appears in compose"
fi
grep -Fq '${TWENTY_SECRET_ENV_FILE:?' "$COMPOSE" || fail "external Twenty secret env file is not mandatory"
grep -Fq '${TWENTY_ADAPTER_API_KEY_FILE:?' "$COMPOSE" || fail "external adapter API-key file is not mandatory"
grep -Fq 'TWENTY_DATABASE_URL_FILE: /run/secrets/twenty-database-url' "$COMPOSE" || fail "adapter read-only database URL file is not wired"
grep -Fq '${TWENTY_ADAPTER_DATABASE_URL_FILE:?' "$COMPOSE" || fail "external adapter read-only database URL file is not mandatory"
grep -Fq 'TWENTY_ADAPTER_DATABASE_URL_FILE=/run/gbap-secrets/twenty/adapter-database-url' "$RUNTIME" || fail "runtime contract does not declare adapter read-only database URL secret"
grep -Fq 'SELECT only' "$RUNTIME" || fail "adapter database least-privilege contract missing"
pass "Twenty and adapter secret material is externalized with a dedicated read-only metadata credential"

jq -e '
  .id=="twenty-crm-production" and
  .integrationMode=="HEADLESS_PROVIDER" and
  .environmentScope=="production" and
  .lifecycleOwner=="GBAP_MANAGED" and
  .replacementClass=="R4" and
  .replacementEvidence=="E0" and
  .failureMode=="DEGRADE" and
  .contractVersion=="gbap.crm.v1" and
  .upstreamProduct=="Twenty" and
  .upstreamVersion=="v2.37.0"
' "$REGISTRATION" >/dev/null || fail "production provider lifecycle metadata mismatch"
grep -Fq 'GBAP_SUBSTRATE_ENV=production' "$RUNTIME" || fail "GBAP production SUBSTRATE_ENV contract missing"
grep -Fq 'organizationScope/workspaceScope are null' "$RUNTIME" || fail "production-global provider scope posture is not explicit"
pass "production provider registration and GBAP resolver environment/scope are aligned"

EXPECTED_CANONICAL='["crm.v1.account.create","crm.v1.account.list","crm.v1.contact.create","crm.v1.contact.list","crm.v1.opportunity.create","crm.v1.opportunity.list","crm.v1.snapshot.export"]'
EXPECTED_OPERATIONAL='["crm.ops.v1.activity.list","crm.ops.v1.calendar.list","crm.ops.v1.calendar.status","crm.ops.v1.contact.update","crm.ops.v1.email.list","crm.ops.v1.email.status","crm.ops.v1.note.create","crm.ops.v1.note.list","crm.ops.v1.note.update","crm.ops.v1.opportunity.update","crm.ops.v1.task.create","crm.ops.v1.task.list","crm.ops.v1.task.update"]'
ACTUAL_CANONICAL="$(jq -c '[.capabilities[].name | select(startswith("crm.v1."))] | sort' "$REGISTRATION")"
ACTUAL_OPERATIONAL="$(jq -c '[.capabilities[].name | select(startswith("crm.ops.v1."))] | sort' "$REGISTRATION")"
UNKNOWN_CAPS="$(jq -c '[.capabilities[].name | select((startswith("crm.v1.") or startswith("crm.ops.v1.")) | not)] | sort' "$REGISTRATION")"
SORTED_CANONICAL="$(jq -nc --argjson caps "$EXPECTED_CANONICAL" '$caps | sort')"
SORTED_OPERATIONAL="$(jq -nc --argjson caps "$EXPECTED_OPERATIONAL" '$caps | sort')"
[[ "$ACTUAL_CANONICAL" == "$SORTED_CANONICAL" ]] || fail "mandatory canonical CRM capability set mismatch: $ACTUAL_CANONICAL"
[[ "$ACTUAL_OPERATIONAL" == "$SORTED_OPERATIONAL" ]] || fail "allowlisted CRM operational capability set mismatch: $ACTUAL_OPERATIONAL"
[[ "$UNKNOWN_CAPS" == '[]' ]] || fail "unapproved production CRM capabilities exposed: $UNKNOWN_CAPS"
pass "production routing exposes the complete canonical CRM slice plus only explicitly allowlisted operational capabilities"

jq -e '.secretRef=="secret://crm/twenty/adapter-api-key" and .egressAllowlist==["twenty-adapter"]' "$REGISTRATION" >/dev/null || fail "provider secretRef/egress posture mismatch"
pass "provider secret reference and GBAP egress allowlist are explicit"

if grep -Eqi 'frappe' "$COMPOSE" "$REGISTRATION"; then
  fail "Frappe must not appear in normal Twenty production runtime routing"
fi
pass "Frappe remains outside normal selected-engine runtime routing"

grep -Fq 'automated lead/customer acquisition' "$README" || fail "external acquisition brick boundary missing"
grep -Fq 'WhatsApp and other messaging providers' "$README" || fail "external messaging brick boundary missing"
grep -Fq 'AI assistants, agents and model providers' "$README" || fail "external AI brick boundary missing"
pass "customer acquisition, messaging and AI remain separately replaceable bricks"

grep -Fq 'dedicated adapter database role' "$README" || fail "adapter database least-privilege documentation missing"
grep -Fq 'core.messageChannel' "$README" || fail "message channel metadata scope is undocumented"
grep -Fq 'core.calendarChannel' "$README" || fail "calendar channel metadata scope is undocumented"

grep -Fq 'A production backup is incomplete unless it captures' "$README" || fail "backup completeness contract missing"
grep -Fq 'A backup that has never passed a restore drill is not production DR evidence.' "$README" || fail "restore-drill rule missing"
pass "backup/restore minimum contract is recorded"

grep -Fq 'A new identity does not silently inherit replacement evidence.' "$README" || fail "upgrade evidence inheritance prohibition missing"
grep -Fq 'Rollback must mean restoring the previously approved image/config/schema combination plus compatible data' "$README" || fail "rollback compatibility rule missing"
pass "upgrade/revalidation and rollback rules are explicit"

node --check "$ADAPTER"
node --check "$ADAPTER_EXTENSION"
pass "selected Twenty adapter and governed operational extension remain syntactically valid"

[[ "$PASS_COUNT" == "12" ]] || fail "expected 12 assertions, got $PASS_COUNT"
printf 'PASS — Twenty production integration foundation governance: assertions=%d\n' "$PASS_COUNT"
