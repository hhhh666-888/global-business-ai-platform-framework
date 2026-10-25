#!/usr/bin/env bash

crm_runtime_permission_conformance() {
  local user_token="$1"
  local provider_label="$2"
  local pass_count=0

  permission_pass() {
    pass_count=$((pass_count + 1))
    printf '[crm-runtime-permission][PASS %02d] %s\n' "$pass_count" "$*"
  }

  local status
  status="$(curl -sS --max-time 90 -o /tmp/runtime-permission-company.json -w '%{http_code}' \
    "$API/api/crm-runtime/objects/company/records?limit=2" \
    -H "authorization: Bearer $user_token")"
  [[ "$status" == "200" ]] || fail "runtime permission normal company read expected 200, got $status: $(cat /tmp/runtime-permission-company.json)"
  jq -e '.records|type=="array"' /tmp/runtime-permission-company.json >/dev/null || fail "runtime permission normal company read payload mismatch"
  permission_pass "$provider_label business-object READ passed GBAP allow AND provider allow, including first-use principal bootstrap"

  status="$(curl -sS --max-time 60 -o /tmp/runtime-permission-system-read.json -w '%{http_code}' \
    "$API/api/crm-runtime/objects/workspaceMember/records?limit=1" \
    -H "authorization: Bearer $user_token")"
  [[ "$status" == "403" ]] || fail "runtime permission system-object read expected 403, got $status: $(cat /tmp/runtime-permission-system-read.json)"
  jq -e '.error=="provider_permission_denied" and .detail.reason=="provider_system_object_not_business_exposed" and .detail.action=="READ"' /tmp/runtime-permission-system-read.json >/dev/null \
    || fail "runtime permission system-object READ deny payload mismatch"
  permission_pass "$provider_label provider system object cannot be read through direct GBAP runtime URL"

  status="$(curl -sS --max-time 60 -o /tmp/runtime-permission-system-create.json -w '%{http_code}' -X POST \
    "$API/api/crm-runtime/objects/workspaceMember/records" \
    -H "authorization: Bearer $user_token" -H 'content-type: application/json' \
    --data '{"fields":{}}')"
  [[ "$status" == "403" ]] || fail "runtime permission system-object create expected 403, got $status: $(cat /tmp/runtime-permission-system-create.json)"
  jq -e '.error=="provider_permission_denied" and .detail.reason=="provider_system_object_not_business_exposed" and .detail.action=="CREATE"' /tmp/runtime-permission-system-create.json >/dev/null \
    || fail "runtime permission system-object CREATE deny payload mismatch"
  permission_pass "$provider_label provider system object cannot be mutated through direct GBAP runtime URL"

  [[ "$pass_count" == "3" ]] || fail "CRM runtime permission conformance expected 3 assertions, got $pass_count"
  printf 'PASS — CRM runtime permission intersection: provider=%s assertions=%d\n' "$provider_label" "$pass_count"
}
