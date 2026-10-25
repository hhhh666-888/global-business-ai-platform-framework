#!/usr/bin/env bash

crm_manager_rbac_conformance() {
  local admin_token="$1"
  local user_token="$2"
  local manager_token="$3"
  local provider_label="$4"
  local pass_count=0

  rbac_pass() {
    pass_count=$((pass_count + 1))
    printf '[crm-rbac][PASS %02d] %s\n' "$pass_count" "$*"
  }

  local status

  status="$(curl -sS --max-time 15 -o /tmp/crm-manager-me.json -w '%{http_code}' \
    "$API/api/me" -H "authorization: Bearer $manager_token")"
  [[ "$status" == "200" ]] || fail "manager /api/me expected 200, got $status: $(cat /tmp/crm-manager-me.json)"
  jq -e '
    (.roles | index("substrate-user")) != null and
    (.roles | index("substrate-manager")) != null and
    (.roles | index("substrate-admin")) == null
  ' /tmp/crm-manager-me.json >/dev/null || fail "manager identity did not preserve user+manager without admin"
  rbac_pass "$provider_label manager OIDC identity carries user+manager roles and no admin role"

  status="$(curl -sS --max-time 30 -o /tmp/crm-manager-list.json -w '%{http_code}' \
    -X POST "$API/api/capabilities/crm.v1.account.list/invoke" \
    -H "authorization: Bearer $manager_token" \
    -H 'content-type: application/json' \
    --data '{"payload":{"limit":5}}')"
  [[ "$status" == "200" ]] || fail "manager canonical CRM access expected 200, got $status: $(cat /tmp/crm-manager-list.json)"
  jq -e '.result.records | type=="array"' /tmp/crm-manager-list.json >/dev/null || fail "manager canonical CRM response shape mismatch"
  rbac_pass "$provider_label manager can use ordinary CRM capabilities"

  status="$(curl -sS --max-time 15 -o /tmp/crm-manager-views.json -w '%{http_code}' \
    "$API/api/crm-native/views" -H "authorization: Bearer $manager_token")"
  [[ "$status" == "200" ]] || fail "manager native CRM access expected 200, got $status: $(cat /tmp/crm-manager-views.json)"
  jq -e '.views | type=="array"' /tmp/crm-manager-views.json >/dev/null || fail "manager native CRM response shape mismatch"
  rbac_pass "$provider_label manager can use GBAP-native CRM product data"

  status="$(curl -sS --max-time 15 -o /tmp/crm-manager-audit.json -w '%{http_code}' \
    "$API/api/audit" -H "authorization: Bearer $manager_token")"
  [[ "$status" == "403" ]] || fail "manager audit access must be forbidden, got $status: $(cat /tmp/crm-manager-audit.json)"
  rbac_pass "$provider_label manager cannot read substrate administration audit"

  status="$(curl -sS --max-time 15 -o /tmp/crm-manager-provider.json -w '%{http_code}' \
    -X POST "$API/api/providers" \
    -H "authorization: Bearer $manager_token" \
    -H 'content-type: application/json' \
    --data '{}')"
  [[ "$status" == "403" ]] || fail "manager provider administration must be forbidden, got $status: $(cat /tmp/crm-manager-provider.json)"
  rbac_pass "$provider_label manager cannot register or govern CRM providers"

  status="$(curl -sS --max-time 15 -o /tmp/crm-user-me.json -w '%{http_code}' \
    "$API/api/me" -H "authorization: Bearer $user_token")"
  [[ "$status" == "200" ]] || fail "employee /api/me expected 200, got $status: $(cat /tmp/crm-user-me.json)"
  jq -e '
    (.roles | index("substrate-user")) != null and
    (.roles | index("substrate-manager")) == null and
    (.roles | index("substrate-admin")) == null
  ' /tmp/crm-user-me.json >/dev/null || fail "ordinary employee identity unexpectedly carries manager/admin privilege"
  rbac_pass "$provider_label ordinary employee remains below manager/admin privilege"

  [[ "$pass_count" == "6" ]] || fail "manager RBAC conformance expected 6 assertions, got $pass_count"
  printf 'PASS — CRM manager RBAC conformance: provider=%s assertions=%d\n' "$provider_label" "$pass_count"
}
