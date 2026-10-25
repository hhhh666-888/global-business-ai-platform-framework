#!/usr/bin/env bash

crm_communication_conformance() {
  local user_token="$1"
  local provider_label="$2"
  local pass_count=0

  comm_pass() {
    pass_count=$((pass_count + 1))
    printf '[crm-communication][PASS %02d] %s\n' "$pass_count" "$*"
  }

  comm_request() {
    local capability="$1" output="$2"
    local status
    status="$(curl -sS --max-time 30 -o "$output" -w '%{http_code}' \
      -X POST "$API/api/capabilities/$capability/invoke" \
      -H "authorization: Bearer $user_token" \
      -H 'content-type: application/json' \
      --data '{"payload":{"limit":100}}')"
    [[ "$status" == "200" ]] || fail "communication $capability expected 200, got $status: $(cat "$output")"
  }

  comm_request crm.ops.v1.email.status /tmp/comm-email-status.json
  jq -e '
    .result.status.kind=="EMAIL" and
    (.result.status.state=="UNCONFIGURED" or .result.status.state=="CONNECTED" or .result.status.state=="ATTENTION") and
    (.result.status.configured|type)=="boolean" and
    (.result.status.channels|type)=="array"
  ' /tmp/comm-email-status.json >/dev/null || fail "email status response is not a governed connection state"
  comm_pass "$provider_label email connection status is a real governed state"

  comm_request crm.ops.v1.email.list /tmp/comm-email-list.json
  jq -e '.result.records|type=="array"' /tmp/comm-email-list.json >/dev/null || fail "email list response is not an array"
  jq -e '.result.records | map(has("externalId") or has("id")) | any | not' /tmp/comm-email-list.json >/dev/null || fail "email list leaked provider record identity"
  comm_pass "$provider_label email endpoint is live and returns business-safe synced records or an empty set"

  comm_request crm.ops.v1.calendar.status /tmp/comm-calendar-status.json
  jq -e '
    .result.status.kind=="CALENDAR" and
    (.result.status.state=="UNCONFIGURED" or .result.status.state=="CONNECTED" or .result.status.state=="ATTENTION") and
    (.result.status.configured|type)=="boolean" and
    (.result.status.channels|type)=="array"
  ' /tmp/comm-calendar-status.json >/dev/null || fail "calendar status response is not a governed connection state"
  comm_pass "$provider_label calendar connection status is a real governed state"

  comm_request crm.ops.v1.calendar.list /tmp/comm-calendar-list.json
  jq -e '.result.records|type=="array"' /tmp/comm-calendar-list.json >/dev/null || fail "calendar list response is not an array"
  jq -e '.result.records | map(has("externalId") or has("id")) | any | not' /tmp/comm-calendar-list.json >/dev/null || fail "calendar list leaked provider record identity"
  comm_pass "$provider_label calendar endpoint is live and returns business-safe synced events or an empty set"

  local suffix="${GITHUB_RUN_ID:-local}-${RANDOM}"
  local status timeline_business_id
  status="$(curl -sS --max-time 60 -o /tmp/comm-timeline-create.json -w '%{http_code}' \
    -X POST "$API/api/crm-runtime/objects/company/records" \
    -H "authorization: Bearer $user_token" -H 'content-type: application/json' \
    --data "$(jq -nc --arg name "Timeline Proof $suffix" '{fields:{name:$name}}')")"
  [[ "$status" == "201" ]] || fail "timeline proof company create expected 201, got $status: $(cat /tmp/comm-timeline-create.json)"
  timeline_business_id="$(jq -er '.record.businessId' /tmp/comm-timeline-create.json)"
  status="$(curl -sS --max-time 60 -o /tmp/comm-timeline-update.json -w '%{http_code}' \
    -X PATCH "$API/api/crm-runtime/objects/company/records/$timeline_business_id" \
    -H "authorization: Bearer $user_token" -H 'content-type: application/json' \
    --data "$(jq -nc --arg name "Timeline Proof Updated $suffix" '{fields:{name:$name}}')")"
  [[ "$status" == "200" ]] || fail "timeline proof company update expected 200, got $status: $(cat /tmp/comm-timeline-update.json)"

  local timeline_ready=0
  for _ in $(seq 1 12); do
    status="$(curl -sS --max-time 30 -o /tmp/comm-timeline-context.json -w '%{http_code}' \
      "$API/api/crm-runtime/objects/company/records/$timeline_business_id/context" \
      -H "authorization: Bearer $user_token")"
    [[ "$status" == "200" ]] || fail "timeline record context expected 200, got $status: $(cat /tmp/comm-timeline-context.json)"
    if jq -e '(.timelineActivities|type)=="array" and (.timelineActivities|length)>=1' /tmp/comm-timeline-context.json >/dev/null; then
      timeline_ready=1
      break
    fi
    sleep 2
  done
  [[ "$timeline_ready" == "1" ]] || fail "Twenty timeline activity did not materialize for created/updated company"
  jq -e --arg id "$timeline_business_id" '.businessId==$id' /tmp/comm-timeline-context.json >/dev/null || fail "timeline context did not preserve GBAP business identity"
  jq -e '.timelineActivities | all(.activityKey|startswith("timeline-activity:"))' /tmp/comm-timeline-context.json >/dev/null || fail "timeline activity did not use public runtime identity"
  if jq -c 'walk(if type=="object" then del(.businessId) else . end)' /tmp/comm-timeline-context.json \
    | grep -Eqi '"[^"[:space:]]*(id|Id|IDs|Ids)"[[:space:]]*:[[:space:]]*"?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'; then
    fail "timeline context leaked provider UUID in identity-like property"
  fi
  comm_pass "$provider_label real Twenty timeline activity is exposed through GBAP record context without provider identity leakage"

  [[ "$pass_count" == "5" ]] || fail "communication conformance expected 5 assertions, got $pass_count"
  printf 'PASS — CRM communication conformance: provider=%s assertions=%d\n' "$provider_label" "$pass_count"
}
