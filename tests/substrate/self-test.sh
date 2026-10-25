#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f infrastructure/compose/docker-compose.yml)
API="http://localhost:8081"
WEB="http://localhost:8080"
OIDC="http://localhost:8082/realms/gbap/protocol/openid-connect"
ADMIN_USER="substrate-admin"
ADMIN_PASSWORD="substrate-admin"
USER_USER="substrate-user"
USER_PASSWORD="substrate-user"
CLIENT_ID="gbap-web"

log() { printf '\n[stage3.3.1] %s\n' "$*"; }
fail() { printf '\n[stage3.3.1][FAIL] %s\n' "$*" >&2; "${COMPOSE[@]}" ps || true; "${COMPOSE[@]}" logs --no-color --tail=120 || true; exit 1; }

wait_http() {
  local url="$1"; local label="$2"; local tries="${3:-90}"
  for ((i=1; i<=tries; i++)); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      log "$label ready"
      return 0
    fi
    sleep 2
  done
  fail "$label did not become ready: $url"
}

request_status() {
  local output="$1"; shift
  curl -sS --max-time 10 -o "$output" -w '%{http_code}' "$@"
}

get_token() {
  local username="$1"; local password="$2"
  curl -fsS --max-time 10 -X POST "$OIDC/token" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "username=$username" \
    --data-urlencode "password=$password" | jq -er '.access_token'
}

wait_provider_health() {
  local expected="$1"; local token="$2"; local tries="${3:-40}"
  for ((i=1; i<=tries; i++)); do
    local body
    body="$(curl -fsS --max-time 5 "$API/api/providers" -H "authorization: Bearer $token" || true)"
    local status
    status="$(printf '%s' "$body" | jq -r '.providers[]? | select(.id=="reference-echo") | .health.status // empty' 2>/dev/null || true)"
    if [[ "$status" == "$expected" ]]; then
      log "reference-echo health=$expected"
      return 0
    fi
    sleep 2
  done
  fail "reference-echo did not reach health=$expected"
}

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "clean boot from normalized repository structure"
"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d --build

wait_http "$WEB/healthz" "GBAP web"
wait_http "$API/healthz" "GBAP API"
wait_http "http://localhost:8082/realms/gbap/.well-known/openid-configuration" "Keycloak realm" 120

log "authentication and authorization"
ADMIN_TOKEN="$(get_token "$ADMIN_USER" "$ADMIN_PASSWORD")"
USER_TOKEN="$(get_token "$USER_USER" "$USER_PASSWORD")"
[[ -n "$ADMIN_TOKEN" && -n "$USER_TOKEN" ]] || fail "OIDC tokens were not issued"

curl -fsS "$API/api/me" -H "authorization: Bearer $ADMIN_TOKEN" | jq -e '.roles | index("substrate-admin") != null' >/dev/null
curl -fsS "$API/api/me" -H "authorization: Bearer $USER_TOKEN" | jq -e '.roles | index("substrate-user") != null' >/dev/null

STATUS="$(request_status /tmp/unauth.json "$API/api/providers")"
[[ "$STATUS" == "401" ]] || fail "unauthenticated provider list expected 401, got $STATUS"

PROVIDER_JSON='{
  "id":"reference-echo",
  "component":"gbap-reference-provider",
  "version":"0.1.0",
  "integrationMode":"HEADLESS_PROVIDER",
  "endpoint":"http://reference-provider:8090",
  "environmentScope":"local",
  "lifecycleOwner":"GBAP_MANAGED",
  "replacementClass":"R1",
  "replacementEvidence":"E0",
  "egressAllowlist":["reference-provider"],
  "timeoutMs":1500,
  "retryCount":0,
  "failureMode":"DEGRADE",
  "capabilities":[{"name":"demo.echo","priority":100}]
}'

STATUS="$(request_status /tmp/user-register.json -X POST "$API/api/providers" -H "authorization: Bearer $USER_TOKEN" -H 'content-type: application/json' --data "$PROVIDER_JSON")"
[[ "$STATUS" == "403" ]] || fail "ordinary user provider registration expected 403, got $STATUS"

log "register reference provider"
STATUS="$(request_status /tmp/register.json -X POST "$API/api/providers" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data "$PROVIDER_JSON")"
[[ "$STATUS" == "201" ]] || fail "provider registration expected 201, got $STATUS: $(cat /tmp/register.json)"
jq -e '.provider.id == "reference-echo"' /tmp/register.json >/dev/null

wait_provider_health "HEALTHY" "$USER_TOKEN"

log "capability resolution and invocation"
STATUS="$(request_status /tmp/invoke.json -X POST "$API/api/capabilities/demo.echo/invoke" -H "authorization: Bearer $USER_TOKEN" -H 'content-type: application/json' --data '{"payload":{"message":"stage3.3.1"}}')"
[[ "$STATUS" == "200" ]] || fail "capability invocation expected 200, got $STATUS: $(cat /tmp/invoke.json)"
jq -e '.providerId == "reference-echo" and .result.ok == true and .result.echo.message == "stage3.3.1"' /tmp/invoke.json >/dev/null

log "provider outage must degrade only the capability"
"${COMPOSE[@]}" stop reference-provider
wait_provider_health "UNAVAILABLE" "$USER_TOKEN"
STATUS="$(request_status /tmp/outage-invoke.json -X POST "$API/api/capabilities/demo.echo/invoke" -H "authorization: Bearer $USER_TOKEN" -H 'content-type: application/json' --data '{"payload":{"message":"during-outage"}}')"
[[ "$STATUS" == "503" ]] || fail "provider outage invocation expected 503, got $STATUS"
curl -fsS "$API/healthz" >/dev/null || fail "GBAP API collapsed when provider stopped"
curl -fsS "$WEB/healthz" >/dev/null || fail "GBAP web collapsed when provider stopped"

log "provider recovery"
"${COMPOSE[@]}" start reference-provider
wait_provider_health "HEALTHY" "$USER_TOKEN"
STATUS="$(request_status /tmp/recovered-invoke.json -X POST "$API/api/capabilities/demo.echo/invoke" -H "authorization: Bearer $USER_TOKEN" -H 'content-type: application/json' --data '{"payload":{"message":"recovered"}}')"
[[ "$STATUS" == "200" ]] || fail "recovered invocation expected 200, got $STATUS"

log "disable/enable binding behavior"
STATUS="$(request_status /tmp/disable.json -X PATCH "$API/api/providers/reference-echo/status" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data '{"enabled":false}')"
[[ "$STATUS" == "200" ]] || fail "disable expected 200, got $STATUS"
STATUS="$(request_status /tmp/disabled-invoke.json -X POST "$API/api/capabilities/demo.echo/invoke" -H "authorization: Bearer $USER_TOKEN" -H 'content-type: application/json' --data '{"payload":{"message":"disabled"}}')"
[[ "$STATUS" == "503" ]] || fail "disabled capability expected 503, got $STATUS"
STATUS="$(request_status /tmp/enable.json -X PATCH "$API/api/providers/reference-echo/status" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data '{"enabled":true}')"
[[ "$STATUS" == "200" ]] || fail "enable expected 200, got $STATUS"

log "durable mapping guard and lifecycle"
STATUS="$(request_status /tmp/mapping-create.json -X POST "$API/api/mappings" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data '{"businessType":"Contact","businessId":"contact-self-test-1","providerId":"reference-echo","externalType":"contact","externalId":"reference-contact-1"}')"
[[ "$STATUS" == "201" ]] || fail "mapping create expected 201, got $STATUS: $(cat /tmp/mapping-create.json)"
MAPPING_ID="$(jq -er '.id' /tmp/mapping-create.json)"

STATUS="$(request_status /tmp/guarded-delete.json -X DELETE "$API/api/providers/reference-echo" -H "authorization: Bearer $ADMIN_TOKEN")"
[[ "$STATUS" == "409" ]] || fail "provider with durable mapping must reject uninstall with 409, got $STATUS"

STATUS="$(request_status /tmp/mapping-delete.json -X DELETE "$API/api/mappings/$MAPPING_ID" -H "authorization: Bearer $ADMIN_TOKEN")"
[[ "$STATUS" == "200" ]] || fail "mapping delete expected 200, got $STATUS: $(cat /tmp/mapping-delete.json)"

log "audit evidence"
curl -fsS "$API/api/audit" -H "authorization: Bearer $ADMIN_TOKEN" > /tmp/audit.json
for action in provider.register provider.disable provider.enable mapping.create mapping.delete provider.invoke.failed; do
  jq -e --arg action "$action" '.events | map(.action) | index($action) != null' /tmp/audit.json >/dev/null || fail "audit missing action=$action"
done

log "clean provider uninstall and zero-provider survival"
STATUS="$(request_status /tmp/unregister.json -X DELETE "$API/api/providers/reference-echo" -H "authorization: Bearer $ADMIN_TOKEN")"
[[ "$STATUS" == "200" ]] || fail "provider unregister expected 200, got $STATUS: $(cat /tmp/unregister.json)"

curl -fsS "$API/api/providers" -H "authorization: Bearer $USER_TOKEN" | jq -e '.providers | length == 0' >/dev/null || fail "provider registry is not empty after uninstall"
STATUS="$(request_status /tmp/zero-provider-invoke.json -X POST "$API/api/capabilities/demo.echo/invoke" -H "authorization: Bearer $USER_TOKEN" -H 'content-type: application/json' --data '{"payload":{"message":"no-provider"}}')"
[[ "$STATUS" == "503" ]] || fail "zero-provider capability should return 503, got $STATUS"

"${COMPOSE[@]}" stop reference-provider
curl -fsS "$API/healthz" >/dev/null || fail "API unavailable in zero-provider state"
curl -fsS "$WEB/healthz" >/dev/null || fail "web unavailable in zero-provider state"

log "PASS — Stage 3.3.1 normalized structure self-test completed"
