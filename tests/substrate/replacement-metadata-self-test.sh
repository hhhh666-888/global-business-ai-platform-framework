#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f infrastructure/compose/docker-compose.yml)
API="http://localhost:8081"
OIDC="http://localhost:8082/realms/gbap/protocol/openid-connect"
CLIENT_ID="gbap-web"
PASS_COUNT=0

pass() { PASS_COUNT=$((PASS_COUNT+1)); printf '[replacement-metadata][PASS %02d] %s\n' "$PASS_COUNT" "$*"; }
fail() { printf '[replacement-metadata][FAIL] %s\n' "$*" >&2; "${COMPOSE[@]}" logs --no-color --tail=100 || true; exit 1; }
cleanup() { "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

wait_http() {
  local url="$1" tries="${2:-90}"
  for ((i=1; i<=tries; i++)); do
    curl -fsS --max-time 3 "$url" >/dev/null 2>&1 && return 0
    sleep 2
  done
  fail "not ready: $url"
}

get_token() {
  local username="$1" password="$2"
  curl -fsS -X POST "$OIDC/token" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode grant_type=password \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "username=$username" \
    --data-urlencode "password=$password" | jq -er '.access_token'
}

status_request() {
  local output="$1"; shift
  curl -sS --max-time 10 -o "$output" -w '%{http_code}' "$@"
}

"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d --build
wait_http "$API/healthz"
wait_http "http://localhost:8082/realms/gbap/.well-known/openid-configuration" 120
ADMIN_TOKEN="$(get_token substrate-admin substrate-admin)"
USER_TOKEN="$(get_token substrate-user substrate-user)"

BASE='{"id":"metadata-crm-test","component":"metadata-test","version":"test","integrationMode":"HEADLESS_PROVIDER","endpoint":"http://reference-provider:8090","environmentScope":"local","lifecycleOwner":"GBAP_MANAGED","replacementClass":"R4","secretRef":"test://none","egressAllowlist":["reference-provider"],"timeoutMs":1500,"retryCount":0,"failureMode":"DEGRADE","capabilities":[{"name":"crm.v1.account.create","priority":100}]}'

STATUS="$(status_request /tmp/non-e0.json -X POST "$API/api/providers" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data "$(printf '%s' "$BASE" | jq '. + {replacementEvidence:"E1"}')")"
[[ "$STATUS" == "400" ]] || fail "non-E0 registration should fail with 400, got $STATUS"
jq -e '.error=="replacement_evidence_must_start_at_E0"' /tmp/non-e0.json >/dev/null
pass "provider registration cannot self-assert E1/E2/E3"

STATUS="$(status_request /tmp/no-provenance.json -X POST "$API/api/providers" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data "$(printf '%s' "$BASE" | jq '. + {replacementEvidence:"E0"}')")"
[[ "$STATUS" == "400" ]] || fail "canonical provider without provenance should fail, got $STATUS"
jq -e '.error=="canonical_crm_provider_requires_contract_version"' /tmp/no-provenance.json >/dev/null
pass "canonical CRM provider must declare contract version"

IMAGE_DIGEST='sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
VALID="$(printf '%s' "$BASE" | jq --arg imageDigest "$IMAGE_DIGEST" '. + {replacementEvidence:"E0",provenance:{contractVersion:"gbap.crm.v1",upstreamProduct:"Reference CRM",upstreamVersion:"test-upstream",upstreamCommit:"git:test-upstream",upstreamImageDigest:$imageDigest,adapterRevision:"git:test-adapter",configRevision:"test-config",schemaRevision:"test-schema"}}')"
STATUS="$(status_request /tmp/register.json -X POST "$API/api/providers" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data "$VALID")"
[[ "$STATUS" == "201" ]] || fail "valid canonical provider registration failed: $STATUS $(cat /tmp/register.json)"
jq -e '.provider.replacementEvidence=="E0" and .provider.provenance.contractVersion=="gbap.crm.v1" and .provider.provenance.upstreamProduct=="Reference CRM" and .provider.provenance.upstreamVersion=="test-upstream" and .provider.provenance.upstreamCommit=="git:test-upstream" and (.provider.provenance.upstreamImageDigest|startswith("sha256:")) and .provider.provenance.adapterRevision=="git:test-adapter"' /tmp/register.json >/dev/null
pass "normalized product/version/commit/image/adapter provenance persisted at E0"

STATUS="$(status_request /tmp/skip.json -X POST "$API/api/providers/metadata-crm-test/replacement-evidence/advance" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data '{"toLevel":"E2","evidenceRef":"test","evidenceDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}')"
[[ "$STATUS" == "409" ]] || fail "E0->E2 skip should fail 409, got $STATUS"
pass "replacement evidence cannot skip levels"

STATUS="$(status_request /tmp/bad-digest.json -X POST "$API/api/providers/metadata-crm-test/replacement-evidence/advance" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data '{"toLevel":"E1","evidenceRef":"test","evidenceDigest":"not-a-digest"}')"
[[ "$STATUS" == "400" ]] || fail "invalid digest should fail 400, got $STATUS"
pass "replacement evidence requires a SHA-256 evidence digest"

DIGEST='sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
STATUS="$(status_request /tmp/no-scope.json -X POST "$API/api/providers/metadata-crm-test/replacement-evidence/advance" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data "$(jq -nc --arg digest "$DIGEST" '{toLevel:"E1",evidenceRef:"docs/evidence/test-export.json",evidenceDigest:$digest,decisionRef:"contracts/crm/v1/contract.json"}')")"
[[ "$STATUS" == "400" ]] || fail "E0->E1 without scope should fail 400, got $STATUS"
jq -e '.error=="replacement_evidence_scope_required"' /tmp/no-scope.json >/dev/null
pass "replacement evidence transition requires an explicit evidence scope"

STATUS="$(status_request /tmp/e1.json -X POST "$API/api/providers/metadata-crm-test/replacement-evidence/advance" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data "$(jq -nc --arg digest "$DIGEST" '{toLevel:"E1",evidenceRef:"docs/evidence/test-export.json",evidenceDigest:$digest,decisionRef:"contracts/crm/v1/contract.json",scope:{environment:"local",contractVersion:"gbap.crm.v1",businessTypes:["Account","Contact","Opportunity"],evidenceClass:"E1_EXPORT"}}')")"
[[ "$STATUS" == "200" ]] || fail "E0->E1 failed: $STATUS $(cat /tmp/e1.json)"
jq -e '.provider.replacementEvidence=="E1" and .transition.fromLevel=="E0" and .transition.toLevel=="E1" and .transition.scope.contractVersion=="gbap.crm.v1" and .transition.provenance.upstreamProduct=="Reference CRM" and .transition.provenance.upstreamCommit=="git:test-upstream" and (.transition.provenance.upstreamImageDigest|startswith("sha256:")) and .transition.provenance.adapterRevision=="git:test-adapter"' /tmp/e1.json >/dev/null
pass "E0->E1 binds evidence, scope and immutable integration provenance snapshot"

STATUS="$(status_request /tmp/repeat.json -X POST "$API/api/providers/metadata-crm-test/replacement-evidence/advance" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data "$(jq -nc --arg digest "$DIGEST" '{toLevel:"E1",evidenceRef:"docs/evidence/test-export.json",evidenceDigest:$digest,scope:{evidenceClass:"E1_EXPORT"}}')")"
[[ "$STATUS" == "409" ]] || fail "repeat E1 should fail 409, got $STATUS"
pass "replacement evidence level cannot be replayed as a mutable flag"

curl -fsS "$API/api/providers/metadata-crm-test/replacement-evidence" -H "authorization: Bearer $USER_TOKEN" > /tmp/history.json
jq -e '.currentLevel=="E1" and (.history|length)==1 and .history[0].evidenceRef=="docs/evidence/test-export.json" and .history[0].scope.evidenceClass=="E1_EXPORT" and .history[0].provenance.contractVersion=="gbap.crm.v1"' /tmp/history.json >/dev/null
pass "replacement evidence transition history preserves scope and provenance snapshot"

curl -fsS "$API/api/audit" -H "authorization: Bearer $ADMIN_TOKEN" > /tmp/audit.json
jq -e '.events | map(.action) | index("provider.replacement_evidence.advance") != null' /tmp/audit.json >/dev/null
pass "replacement evidence advancement is audited"

STATUS="$(status_request /tmp/remove.json -X DELETE "$API/api/providers/metadata-crm-test" -H "authorization: Bearer $ADMIN_TOKEN")"
[[ "$STATUS" == "200" ]] || fail "provider cleanup failed: $STATUS"
pass "evidence history does not prevent governed provider removal when no durable mappings remain"

[[ "$PASS_COUNT" == "11" ]] || fail "expected 11 assertions, got $PASS_COUNT"
printf 'PASS — Replacement Metadata Self-Test completed (%d assertions)\n' "$PASS_COUNT"
