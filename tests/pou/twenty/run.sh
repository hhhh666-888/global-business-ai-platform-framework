#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

GBAP_COMPOSE=(docker compose -f infrastructure/compose/docker-compose.yml)
TWENTY_COMPOSE=(docker compose -f tests/pou/twenty/docker-compose.yml)
API="http://localhost:8081"
WEB="http://localhost:8080"
OIDC="http://localhost:8082/realms/gbap/protocol/openid-connect"
TWENTY="http://localhost:3000"
RUNTIME_DIR="$ROOT/tests/pou/twenty/.runtime"
TOKEN_FILE="$RUNTIME_DIR/twenty-api-key"
EVIDENCE_DIR="${GBAP_POU_EVIDENCE_DIR:-/tmp/gbap-twenty-pou-evidence}"
CLIENT_ID="gbap-web"
PASS_COUNT=0

log() { printf '\n[stage3.4.1] %s\n' "$*"; }
pass() { PASS_COUNT=$((PASS_COUNT + 1)); printf '[PASS %02d] %s\n' "$PASS_COUNT" "$*"; }
fail() {
  printf '\n[stage3.4.1][FAIL] %s\n' "$*" >&2
  "${GBAP_COMPOSE[@]}" ps || true
  "${TWENTY_COMPOSE[@]}" ps || true
  printf '\n--- GBAP logs ---\n' >&2
  "${GBAP_COMPOSE[@]}" logs --no-color --tail=160 || true
  printf '\n--- Twenty PoU logs ---\n' >&2
  "${TWENTY_COMPOSE[@]}" logs --no-color --tail=240 || true
  exit 1
}

cleanup() {
  "${TWENTY_COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  "${GBAP_COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$RUNTIME_DIR"
}
trap cleanup EXIT

wait_http() {
  local url="$1"; local label="$2"; local tries="${3:-120}"
  for ((i=1; i<=tries; i++)); do
    if curl -fsS --max-time 4 "$url" >/dev/null 2>&1; then
      pass "$label ready"
      return 0
    fi
    sleep 2
  done
  fail "$label did not become ready: $url"
}

request_status() {
  local output="$1"; shift
  curl -sS --max-time 15 -o "$output" -w '%{http_code}' "$@"
}

get_gbap_token() {
  local username="$1" password="$2"
  curl -fsS --max-time 10 -X POST "$OIDC/token" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode 'grant_type=password' \
    --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "username=$username" \
    --data-urlencode "password=$password" | jq -er '.access_token'
}

graphql() {
  local output="$1" token="$2" query="$3" variables="$4"
  local args=(-sS --max-time 120 -o "$output" -w '%{http_code}' -X POST "$TWENTY/metadata" -H 'content-type: application/json')
  local status
  if [[ -n "$token" ]]; then args+=(-H "authorization: Bearer $token"); fi

  if ! status="$(jq -n --arg query "$query" --argjson variables "$variables" '{query:$query,variables:$variables}' \
    | curl "${args[@]}" --data-binary @-)"; then
    [[ -f "$output" ]] && cat "$output" >&2 || true
    fail "Twenty GraphQL transport failed or timed out"
  fi

  if [[ ! "$status" =~ ^2[0-9][0-9]$ ]]; then
    [[ -f "$output" ]] && cat "$output" >&2 || true
    fail "Twenty GraphQL HTTP status $status"
  fi

  if ! jq -e . "$output" >/dev/null 2>&1; then
    cat "$output" >&2 || true
    fail "Twenty GraphQL returned non-JSON response"
  fi

  if jq -e '(.errors // []) | length > 0' "$output" >/dev/null; then
    cat "$output" >&2
    fail "Twenty GraphQL operation returned errors"
  fi
}

wait_twenty_api_key_ready() {
  local token="$1" tries="${2:-90}"
  local output=/tmp/twenty-api-key-ready.json
  local status
  for ((i=1; i<=tries; i++)); do
    status="$(curl -sS --max-time 10 -o "$output" -w '%{http_code}' \
      "$TWENTY/rest/companies?limit=1" -H "authorization: Bearer $token" 2>/dev/null || true)"
    if [[ "$status" == "200" ]] && jq -e . "$output" >/dev/null 2>&1; then
      pass "Twenty API-key REST schema ready"
      return 0
    fi
    sleep 2
  done
  printf 'Last Twenty API-key readiness status: %s\n' "${status:-none}" >&2
  [[ -f "$output" ]] && cat "$output" >&2 || true
  fail "Twenty fresh workspace did not become API-key REST-ready"
}

invoke() {
  local capability="$1" payload_json="$2" output="$3" token="$4"
  local body
  body="$(jq -nc --argjson payload "$payload_json" '{payload:$payload}')"
  local status
  status="$(request_status "$output" -X POST "$API/api/capabilities/$capability/invoke" \
    -H "authorization: Bearer $token" -H 'content-type: application/json' --data "$body")"
  [[ "$status" == "200" ]] || fail "capability $capability expected 200, got $status: $(cat "$output")"
}

wait_provider_health() {
  local expected="$1" token="$2" tries="${3:-60}"
  for ((i=1; i<=tries; i++)); do
    local status
    status="$(curl -fsS --max-time 5 "$API/api/providers" -H "authorization: Bearer $token" \
      | jq -r '.providers[]? | select(.id=="twenty-crm-pou") | .health.status // empty' 2>/dev/null || true)"
    if [[ "$status" == "$expected" ]]; then
      pass "Twenty provider health=$expected"
      return 0
    fi
    sleep 2
  done
  fail "Twenty provider did not reach health=$expected"
}

create_mapping() {
  local business_type="$1" business_id="$2" external_type="$3" external_id="$4" token="$5" output="$6"
  local body
  body="$(jq -nc \
    --arg businessType "$business_type" --arg businessId "$business_id" \
    --arg providerId 'twenty-crm-pou' --arg externalType "$external_type" --arg externalId "$external_id" \
    '{businessType:$businessType,businessId:$businessId,providerId:$providerId,externalType:$externalType,externalId:$externalId}')"
  local status
  status="$(request_status "$output" -X POST "$API/api/mappings" -H "authorization: Bearer $token" -H 'content-type: application/json' --data "$body")"
  [[ "$status" == "201" ]] || fail "mapping creation failed: $status $(cat "$output")"
  jq -er '.id' "$output"
}

log "clean isolated GBAP + Twenty PoU boot"
rm -rf "$RUNTIME_DIR" "$EVIDENCE_DIR"
mkdir -p "$RUNTIME_DIR" "$EVIDENCE_DIR"
"${TWENTY_COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
"${GBAP_COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
"${GBAP_COMPOSE[@]}" up -d --build
wait_http "$WEB/healthz" "GBAP web"
wait_http "$API/healthz" "GBAP API"
wait_http "http://localhost:8082/realms/gbap/.well-known/openid-configuration" "GBAP Keycloak realm" 120

ADMIN_TOKEN="$(get_gbap_token substrate-admin substrate-admin)"
USER_TOKEN="$(get_gbap_token substrate-user substrate-user)"
[[ -n "$ADMIN_TOKEN" && -n "$USER_TOKEN" ]] || fail "GBAP tokens not issued"
pass "GBAP admin/user authentication"

"${TWENTY_COMPOSE[@]}" up -d twenty-db twenty-redis twenty-server twenty-worker
wait_http "$TWENTY/healthz" "Twenty server" 180

TWENTY_CONTAINER="$("${TWENTY_COMPOSE[@]}" ps -q twenty-server)"
TWENTY_IMAGE_ID="$(docker inspect "$TWENTY_CONTAINER" --format '{{.Image}}')"
[[ "$TWENTY_IMAGE_ID" == sha256:* ]] || fail "Twenty image identity unavailable"
pass "Twenty image identity captured"

log "bootstrap a real Twenty workspace and service API key"
POU_EMAIL="gbap-pou-${GITHUB_RUN_ID:-local}@example.com"
POU_PASSWORD='GbapTwentyPoU-2026!'

SIGNUP_QUERY='mutation SignUp($email:String!,$password:String!){signUp(email:$email,password:$password){tokens{accessOrWorkspaceAgnosticToken{token expiresAt}} availableWorkspaces{availableWorkspacesForSignIn{id} availableWorkspacesForSignUp{id}}}}'
graphql /tmp/twenty-signup.json '' "$SIGNUP_QUERY" "$(jq -nc --arg email "$POU_EMAIL" --arg password "$POU_PASSWORD" '{email:$email,password:$password}')"
WA_TOKEN="$(jq -er '.data.signUp.tokens.accessOrWorkspaceAgnosticToken.token' /tmp/twenty-signup.json)"
[[ -n "$WA_TOKEN" ]] || fail "Twenty signUp did not return workspace-agnostic token"
pass "Twenty user sign-up"

WORKSPACE_QUERY='mutation SignUpInNewWorkspace($input:SignUpInNewWorkspaceInput){signUpInNewWorkspace(input:$input){loginToken{token expiresAt} workspace{id workspaceUrls{customUrl subdomainUrl}}}}'
graphql /tmp/twenty-workspace.json "$WA_TOKEN" "$WORKSPACE_QUERY" '{"input":{"displayName":"GBAP CRM PoU"}}'
WORKSPACE_ID="$(jq -er '.data.signUpInNewWorkspace.workspace.id' /tmp/twenty-workspace.json)"
LOGIN_TOKEN="$(jq -er '.data.signUpInNewWorkspace.loginToken.token' /tmp/twenty-workspace.json)"
[[ -n "$WORKSPACE_ID" && -n "$LOGIN_TOKEN" ]] || fail "Twenty workspace creation failed"
pass "Twenty workspace creation"

TOKEN_QUERY='mutation GetAuthTokensFromLoginToken($loginToken:String!,$origin:String!){getAuthTokensFromLoginToken(loginToken:$loginToken,origin:$origin){tokens{accessOrWorkspaceAgnosticToken{token expiresAt} refreshToken{token expiresAt}}}}'
graphql /tmp/twenty-auth.json '' "$TOKEN_QUERY" "$(jq -nc --arg loginToken "$LOGIN_TOKEN" --arg origin 'http://localhost:3000' '{loginToken:$loginToken,origin:$origin}')"
TWENTY_USER_TOKEN="$(jq -er '.data.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token' /tmp/twenty-auth.json)"
[[ -n "$TWENTY_USER_TOKEN" ]] || fail "Twenty workspace access token exchange failed"
pass "Twenty workspace access-token exchange"

ACTIVATE_QUERY='mutation ActivateWorkspace($input:ActivateWorkspaceInput!){activateWorkspace(data:$input){id activationStatus}}'
graphql /tmp/twenty-activate-workspace.json "$TWENTY_USER_TOKEN" "$ACTIVATE_QUERY" '{"input":{}}'
ACTIVATION_STATUS="$(jq -er '.data.activateWorkspace.activationStatus' /tmp/twenty-activate-workspace.json)"
[[ "$ACTIVATION_STATUS" == "ACTIVE" ]] || fail "Twenty workspace activation expected ACTIVE, got $ACTIVATION_STATUS"
pass "Twenty workspace explicitly activated"

CURRENT_WORKSPACE_QUERY='query MetadataCurrentWorkspace{currentWorkspace{id activationStatus}}'
graphql /tmp/twenty-current-workspace.json "$TWENTY_USER_TOKEN" "$CURRENT_WORKSPACE_QUERY" '{}'
jq -e --arg workspaceId "$WORKSPACE_ID" '.data.currentWorkspace.id==$workspaceId and .data.currentWorkspace.activationStatus=="ACTIVE"' /tmp/twenty-current-workspace.json >/dev/null || fail "Twenty metadata semantic readiness failed"
pass "Twenty metadata semantic readiness"

ROLES_QUERY='query GetApiKeyRoles{getApiKeyRoles{id label icon canBeAssignedToApiKeys}}'
graphql /tmp/twenty-roles.json "$TWENTY_USER_TOKEN" "$ROLES_QUERY" '{}'
ROLE_ID="$(jq -r '[.data.getApiKeyRoles[] | select(.canBeAssignedToApiKeys==true and ((.label // "")|ascii_downcase|contains("admin")))][0].id // empty' /tmp/twenty-roles.json)"
if [[ -z "$ROLE_ID" ]]; then
  ROLE_ID="$(jq -er '[.data.getApiKeyRoles[] | select(.canBeAssignedToApiKeys==true)][0].id' /tmp/twenty-roles.json)"
fi
pass "Twenty API-key assignable role discovered"

EXPIRES_AT="$(date -u -d '+1 day' '+%Y-%m-%dT%H:%M:%S.000Z')"
CREATE_KEY_QUERY='mutation CreateApiKey($input:CreateApiKeyInput!){createApiKey(input:$input){id name expiresAt}}'
graphql /tmp/twenty-create-key.json "$TWENTY_USER_TOKEN" "$CREATE_KEY_QUERY" "$(jq -nc --arg roleId "$ROLE_ID" --arg expiresAt "$EXPIRES_AT" '{input:{name:"GBAP PoU Adapter",expiresAt:$expiresAt,roleId:$roleId}}')"
API_KEY_ID="$(jq -er '.data.createApiKey.id' /tmp/twenty-create-key.json)"

GENERATE_KEY_QUERY='mutation GenerateApiKeyToken($apiKeyId:UUID!,$expiresAt:String!){generateApiKeyToken(apiKeyId:$apiKeyId,expiresAt:$expiresAt){token}}'
graphql /tmp/twenty-generate-key.json "$TWENTY_USER_TOKEN" "$GENERATE_KEY_QUERY" "$(jq -nc --arg apiKeyId "$API_KEY_ID" --arg expiresAt "$EXPIRES_AT" '{apiKeyId:$apiKeyId,expiresAt:$expiresAt}')"
TWENTY_API_KEY="$(jq -er '.data.generateApiKeyToken.token' /tmp/twenty-generate-key.json)"
printf '%s' "$TWENTY_API_KEY" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
pass "Twenty dedicated service API key generated"
wait_twenty_api_key_ready "$TWENTY_API_KEY" 90

log "create a real custom object through Twenty metadata API"
CREATE_OBJECT_QUERY='mutation CreateOneObjectMetadataItem($input:CreateOneObjectInput!){createOneObject(input:$input){id nameSingular namePlural labelSingular labelPlural}}'
CUSTOM_OBJECT_VARS='{"input":{"object":{"nameSingular":"gbapProject","namePlural":"gbapProjects","labelSingular":"GBAP Project","labelPlural":"GBAP Projects","icon":"IconBriefcase"}}}'
graphql /tmp/twenty-custom-object.json "$TWENTY_USER_TOKEN" "$CREATE_OBJECT_QUERY" "$CUSTOM_OBJECT_VARS"
CUSTOM_OBJECT_ID="$(jq -er '.data.createOneObject.id' /tmp/twenty-custom-object.json)"
[[ -n "$CUSTOM_OBJECT_ID" ]] || fail "custom object id missing"
pass "Twenty custom object created"

log "start protocol adapter and register Twenty as a GBAP provider"
"${TWENTY_COMPOSE[@]}" up -d --build twenty-adapter
PROVIDER_VERSION="image:${TWENTY_IMAGE_ID#sha256:}"
PROVIDER_JSON="$(jq -nc --arg version "$PROVIDER_VERSION" '{
  id:"twenty-crm-pou",
  component:"twenty-crm",
  version:$version,
  integrationMode:"HEADLESS_PROVIDER",
  endpoint:"http://twenty-adapter:8091",
  environmentScope:"local",
  lifecycleOwner:"GBAP_MANAGED",
  replacementClass:"R4",
  replacementEvidence:"E0",
  secretRef:"pou://twenty-api-key",
  egressAllowlist:["twenty-adapter"],
  timeoutMs:10000,
  retryCount:0,
  failureMode:"DEGRADE",
  capabilities:[
    {name:"crm.company.create",priority:100},
    {name:"crm.company.list",priority:100},
    {name:"crm.person.create",priority:100},
    {name:"crm.person.list",priority:100},
    {name:"crm.opportunity.create",priority:100},
    {name:"crm.opportunity.list",priority:100},
    {name:"crm.custom-record.create",priority:100},
    {name:"crm.record.list",priority:100},
    {name:"crm.snapshot.export",priority:100}
  ]
}')"
STATUS="$(request_status /tmp/provider-register.json -X POST "$API/api/providers" -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' --data "$PROVIDER_JSON")"
[[ "$STATUS" == "201" ]] || fail "Twenty provider registration expected 201, got $STATUS: $(cat /tmp/provider-register.json)"
jq -e '.provider.id=="twenty-crm-pou" and .provider.secretRef=="pou://twenty-api-key" and .provider.replacementClass=="R4"' /tmp/provider-register.json >/dev/null
pass "Twenty provider registered without persisting raw API key"
wait_provider_health HEALTHY "$USER_TOKEN"

log "real CRM CRUD through GBAP capability boundary"
invoke crm.company.create '{"name":"GBAP Ecuador Industrial Prospect"}' /tmp/company.json "$USER_TOKEN"
COMPANY_ID="$(jq -er '.result.record.id' /tmp/company.json)"
pass "Company created through GBAP -> adapter -> Twenty"

invoke crm.person.create "$(jq -nc --arg companyExternalId "$COMPANY_ID" '{firstName:"Maria",lastName:"Procurement",companyExternalId:$companyExternalId}')" /tmp/person.json "$USER_TOKEN"
PERSON_ID="$(jq -er '.result.record.id' /tmp/person.json)"
pass "Person created and linked to external company"

invoke crm.opportunity.create "$(jq -nc --arg companyExternalId "$COMPANY_ID" '{name:"20MW Solar + Storage Opportunity",companyExternalId:$companyExternalId}')" /tmp/opportunity.json "$USER_TOKEN"
OPPORTUNITY_ID="$(jq -er '.result.record.id' /tmp/opportunity.json)"
pass "Opportunity created through GBAP"

invoke crm.custom-record.create '{"objectPlural":"gbapProjects","fields":{"name":"Ecuador Integrated Energy Project"}}' /tmp/custom-record.json "$USER_TOKEN"
PROJECT_EXTERNAL_ID="$(jq -er '.result.record.id' /tmp/custom-record.json)"
pass "Custom-object record created through generated Twenty REST API"

log "durable external mappings"
MAP_ACCOUNT="$(create_mapping Account GBAP-ACC-POU-001 company "$COMPANY_ID" "$ADMIN_TOKEN" /tmp/map-account.json)"
MAP_CONTACT="$(create_mapping Contact GBAP-CON-POU-001 person "$PERSON_ID" "$ADMIN_TOKEN" /tmp/map-contact.json)"
MAP_OPP="$(create_mapping Opportunity GBAP-OPP-POU-001 opportunity "$OPPORTUNITY_ID" "$ADMIN_TOKEN" /tmp/map-opp.json)"
MAP_PROJECT="$(create_mapping Project GBAP-PRJ-POU-001 gbapProject "$PROJECT_EXTERNAL_ID" "$ADMIN_TOKEN" /tmp/map-project.json)"
[[ -n "$MAP_ACCOUNT" && -n "$MAP_CONTACT" && -n "$MAP_OPP" && -n "$MAP_PROJECT" ]] || fail "mapping ids missing"
pass "Four GBAP canonical IDs mapped to Twenty external IDs"

log "API-level exit evidence"
invoke crm.snapshot.export '{"customObjects":["gbapProjects"]}' /tmp/twenty-export.json "$USER_TOKEN"
jq -e '.result.snapshot.source=="twenty" and .result.snapshot.custom.gbapProjects != null' /tmp/twenty-export.json >/dev/null
for id in "$COMPANY_ID" "$PERSON_ID" "$OPPORTUNITY_ID" "$PROJECT_EXTERNAL_ID"; do
  grep -Fq "$id" /tmp/twenty-export.json || fail "export snapshot missing record $id"
done
pass "Provider-neutral API snapshot contains all created records"

jq '{snapshot:.result.snapshot}' /tmp/twenty-export.json > "$EVIDENCE_DIR/twenty-api-snapshot.json"
jq '{customObject:.data.createOneObject}' /tmp/twenty-custom-object.json > "$EVIDENCE_DIR/twenty-custom-object-schema.json"
pass "Record and schema export artifacts generated"

log "real upstream outage must not collapse GBAP"
"${TWENTY_COMPOSE[@]}" stop twenty-server
wait_provider_health UNHEALTHY "$USER_TOKEN"
STATUS="$(request_status /tmp/outage.json -X POST "$API/api/capabilities/crm.company.list/invoke" -H "authorization: Bearer $USER_TOKEN" -H 'content-type: application/json' --data '{"payload":{"limit":10}}')"
[[ "$STATUS" == "503" ]] || fail "Twenty outage should return GBAP capability 503, got $STATUS"
curl -fsS "$API/healthz" >/dev/null || fail "GBAP API collapsed with Twenty"
curl -fsS "$WEB/healthz" >/dev/null || fail "GBAP web collapsed with Twenty"
pass "Twenty outage isolated to CRM capability"

log "upstream recovery and data continuity"
"${TWENTY_COMPOSE[@]}" start twenty-server
wait_http "$TWENTY/healthz" "Twenty recovered server" 180
wait_provider_health HEALTHY "$USER_TOKEN"
invoke crm.company.list '{"limit":100}' /tmp/company-list-recovered.json "$USER_TOKEN"
grep -Fq "$COMPANY_ID" /tmp/company-list-recovered.json || fail "company disappeared after Twenty restart"
pass "Twenty restart preserved CRM record"

log "mapped provider cannot be removed"
STATUS="$(request_status /tmp/provider-guard.json -X DELETE "$API/api/providers/twenty-crm-pou" -H "authorization: Bearer $ADMIN_TOKEN")"
[[ "$STATUS" == "409" ]] || fail "mapped Twenty provider uninstall expected 409, got $STATUS"
pass "durable mapping blocks accidental Twenty uninstall"

log "governed mapping release and provider removal"
curl -fsS "$API/api/mappings" -H "authorization: Bearer $ADMIN_TOKEN" > /tmp/provider-mappings-before-release.json
for expected_mapping_id in "$MAP_ACCOUNT" "$MAP_CONTACT" "$MAP_OPP" "$MAP_PROJECT"; do
  jq -e --arg id "$expected_mapping_id" '[.mappings[] | select(.provider_id=="twenty-crm-pou" and .id==$id)] | length==1' \
    /tmp/provider-mappings-before-release.json >/dev/null || fail "expected Twenty durable mapping missing before governed release: $expected_mapping_id"
done
mapfile -t PROVIDER_MAPPING_IDS < <(jq -r '.mappings[] | select(.provider_id=="twenty-crm-pou") | .id' /tmp/provider-mappings-before-release.json)
[[ "${#PROVIDER_MAPPING_IDS[@]}" -ge 4 ]] || fail "Twenty governed release expected at least four durable mappings, got ${#PROVIDER_MAPPING_IDS[@]}"
for mapping_id in "${PROVIDER_MAPPING_IDS[@]}"; do
  STATUS="$(request_status /tmp/map-delete.json -X DELETE "$API/api/mappings/$mapping_id" -H "authorization: Bearer $ADMIN_TOKEN")"
  [[ "$STATUS" == "200" ]] || fail "mapping delete failed for $mapping_id: $STATUS $(cat /tmp/map-delete.json)"
done
curl -fsS "$API/api/mappings" -H "authorization: Bearer $ADMIN_TOKEN" > /tmp/provider-mappings-after-release.json
REMAINING_PROVIDER_MAPPINGS="$(jq '[.mappings[] | select(.provider_id=="twenty-crm-pou")] | length' /tmp/provider-mappings-after-release.json)"
[[ "$REMAINING_PROVIDER_MAPPINGS" == "0" ]] || fail "Twenty governed release left $REMAINING_PROVIDER_MAPPINGS durable mappings: $(jq -c '[.mappings[] | select(.provider_id=="twenty-crm-pou")]' /tmp/provider-mappings-after-release.json)"
pass "all Twenty durable mappings released through governed API"

curl -fsS "$API/api/audit" -H "authorization: Bearer $ADMIN_TOKEN" > /tmp/audit.json
for action in provider.register mapping.create provider.invoke.failed mapping.delete; do
  jq -e --arg action "$action" '.events | map(.action) | index($action) != null' /tmp/audit.json >/dev/null || fail "audit missing $action"
done
pass "integration lifecycle audit evidence present"

STATUS="$(request_status /tmp/provider-remove.json -X DELETE "$API/api/providers/twenty-crm-pou" -H "authorization: Bearer $ADMIN_TOKEN")"
[[ "$STATUS" == "200" ]] || fail "Twenty provider uninstall expected 200, got $STATUS: $(cat /tmp/provider-remove.json)"
pass "Twenty provider unregistered"

"${TWENTY_COMPOSE[@]}" stop twenty-adapter twenty-worker twenty-server twenty-redis twenty-db
curl -fsS "$API/api/providers" -H "authorization: Bearer $USER_TOKEN" | jq -e '[.providers[] | select(.id=="twenty-crm-pou")] | length==0' >/dev/null
STATUS="$(request_status /tmp/no-twenty.json -X POST "$API/api/capabilities/crm.company.list/invoke" -H "authorization: Bearer $USER_TOKEN" -H 'content-type: application/json' --data '{"payload":{"limit":10}}')"
[[ "$STATUS" == "503" ]] || fail "removed CRM capability expected 503, got $STATUS"
curl -fsS "$API/healthz" >/dev/null || fail "GBAP API unavailable after Twenty removal"
curl -fsS "$WEB/healthz" >/dev/null || fail "GBAP web unavailable after Twenty removal"
pass "GBAP survives complete Twenty removal"

jq -n \
  --arg status PASS \
  --arg twentyImageId "$TWENTY_IMAGE_ID" \
  --arg workspaceId "$WORKSPACE_ID" \
  --arg customObjectId "$CUSTOM_OBJECT_ID" \
  --arg companyId "$COMPANY_ID" \
  --arg personId "$PERSON_ID" \
  --arg opportunityId "$OPPORTUNITY_ID" \
  --arg projectExternalId "$PROJECT_EXTERNAL_ID" \
  --argjson assertions "$PASS_COUNT" \
  '{status:$status,assertions:$assertions,twentyImageId:$twentyImageId,workspaceId:$workspaceId,customObjectId:$customObjectId,records:{company:$companyId,person:$personId,opportunity:$opportunityId,gbapProject:$projectExternalId},replacementEvidence:"E1_EXPORT_PROVEN"}' \
  > "$EVIDENCE_DIR/runtime-summary.json"

printf '\nPASS — Stage 3.4.1 Twenty real-engine PoU completed (%d assertions)\n' "$PASS_COUNT"
