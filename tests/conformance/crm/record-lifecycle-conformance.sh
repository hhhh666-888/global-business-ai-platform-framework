#!/usr/bin/env bash

crm_record_lifecycle_conformance() {
  local provider_id="$1"
  local admin_token="$2"
  local user_token="$3"
  local provider_label="$4"
  local suffix="${GITHUB_RUN_ID:-local}-${RANDOM}"
  local pass_count=0

  lifecycle_pass() {
    pass_count=$((pass_count + 1))
    printf '[record-lifecycle][PASS %02d] %s\n' "$pass_count" "$*"
  }

  lifecycle_request() {
    local capability="$1" payload="$2" output="$3" expected="${4:-200}"
    local status
    status="$(curl -sS --max-time 45 -o "$output" -w '%{http_code}' \
      -X POST "$API/api/capabilities/$capability/invoke" \
      -H "authorization: Bearer $user_token" \
      -H 'content-type: application/json' \
      --data "$(jq -nc --argjson payload "$payload" '{payload:$payload}')")"
    [[ "$status" == "$expected" ]] || fail "record lifecycle $capability expected $expected, got $status: $(cat "$output")"
  }

  local account_business_id="GBAP-LIFE-ACC-$suffix"
  local contact_business_id="GBAP-LIFE-CON-$suffix"
  local opportunity_business_id="GBAP-LIFE-OPP-$suffix"
  local account_name="GBAP Lifecycle Company $suffix"
  local updated_name="GBAP Lifecycle Company Updated $suffix"
  local contact_name="Lifecycle Buyer $suffix"
  local opportunity_name="Lifecycle Opportunity $suffix"

  lifecycle_request crm.v1.account.create \
    "$(jq -nc --arg businessId "$account_business_id" --arg displayName "$account_name" '{businessId:$businessId,displayName:$displayName}')" \
    /tmp/lifecycle-account-create.json
  jq -e --arg id "$account_business_id" '.result.record.businessId==$id and (.result.record.externalId|length)>0' /tmp/lifecycle-account-create.json >/dev/null || fail "record lifecycle account create mismatch"
  lifecycle_pass "$provider_label Account created with durable mapping"

  lifecycle_request crm.ops.v1.account.update \
    "$(jq -nc --arg businessId "$account_business_id" --arg displayName "$updated_name" '{businessId:$businessId,displayName:$displayName,website:"https://lifecycle.example.com",linkedinUrl:"https://www.linkedin.com/company/gbap-lifecycle",addressCity:"Quito",addressCountry:"Ecuador",annualRevenue:12500000,annualRevenueCurrency:"USD",primaryEmail:"sales@lifecycle.example.com",primaryPhone:"+59320000000",customerType:"DISTRIBUTOR",relationshipStatus:"QUALIFIED",industry:"Industrial Energy Distribution",employeeCount:180,source:"Google Maps",priority:"HIGH",notes:"Lifecycle conformance profile"}')" \
    /tmp/lifecycle-account-update.json
  jq -e --arg id "$account_business_id" --arg displayName "$updated_name" '
    .result.record.businessId==$id and
    .result.record.displayName==$displayName and
    .result.record.website=="https://lifecycle.example.com" and
    .result.record.linkedinUrl=="https://www.linkedin.com/company/gbap-lifecycle" and
    .result.record.addressCity=="Quito" and
    .result.record.addressCountry=="Ecuador" and
    .result.record.annualRevenue==12500000 and
    .result.record.annualRevenueCurrency=="USD" and
    .result.record.primaryEmail=="sales@lifecycle.example.com" and
    .result.record.customerType=="DISTRIBUTOR" and
    .result.record.relationshipStatus=="QUALIFIED" and
    .result.record.priority=="HIGH"
  ' /tmp/lifecycle-account-update.json >/dev/null || fail "record lifecycle rich account update mismatch"
  lifecycle_pass "$provider_label Company native + GBAP semantic profile updated through governed businessId boundary"

  local profile_status
  profile_status="$(curl -sS --max-time 15 -o /tmp/lifecycle-company-profiles.json -w '%{http_code}' \
    "$API/api/crm-native/company-profiles" -H "authorization: Bearer $user_token")"
  [[ "$profile_status" == "200" ]] || fail "company profile overlay list expected 200, got $profile_status: $(cat /tmp/lifecycle-company-profiles.json)"
  jq -e --arg id "$account_business_id" '.profiles | map(select(.businessId==$id and .industry=="Industrial Energy Distribution" and .employeeCount==180 and .source=="Google Maps")) | length==1' /tmp/lifecycle-company-profiles.json >/dev/null || fail "company profile semantic overlay missing"
  lifecycle_pass "$provider_label Company 360 semantic overlay is readable without provider IDs"

  lifecycle_request crm.v1.contact.create \
    "$(jq -nc --arg businessId "$contact_business_id" --arg personName "$contact_name" '{businessId:$businessId,personName:$personName,email:"buyer@lifecycle.example.com"}')" \
    /tmp/lifecycle-contact-create.json
  lifecycle_request crm.ops.v1.contact.update \
    "$(jq -nc --arg businessId "$contact_business_id" --arg accountBusinessId "$account_business_id" '{businessId:$businessId,accountBusinessId:$accountBusinessId,jobTitle:"Procurement Director",phone:"+593999000000",linkedinUrl:"https://www.linkedin.com/in/lifecycle-buyer"}')" \
    /tmp/lifecycle-contact-update.json
  jq -e --arg id "$contact_business_id" '
    .result.record.businessId==$id and
    .result.record.jobTitle=="Procurement Director" and
    .result.record.phone=="+593999000000" and
    .result.record.linkedinUrl=="https://www.linkedin.com/in/lifecycle-buyer"
  ' /tmp/lifecycle-contact-update.json >/dev/null || fail "record lifecycle rich contact update mismatch"
  lifecycle_pass "$provider_label Contact job/phone/LinkedIn + Company relation updated"

  lifecycle_request crm.v1.opportunity.create \
    "$(jq -nc --arg businessId "$opportunity_business_id" --arg accountBusinessId "$account_business_id" --arg nameSummary "$opportunity_name" '{businessId:$businessId,nameSummary:$nameSummary,lifecycleState:"OPEN",accountBusinessId:$accountBusinessId,estimatedValue:850000,currencyCode:"USD"}')" \
    /tmp/lifecycle-opportunity-create.json
  jq -e --arg id "$opportunity_business_id" '.result.record.businessId==$id' /tmp/lifecycle-opportunity-create.json >/dev/null || fail "record lifecycle opportunity create mismatch"
  lifecycle_pass "$provider_label Opportunity created and linked to Company"

  lifecycle_request crm.ops.v1.account.delete \
    "$(jq -nc --arg businessId "$account_business_id" '{businessId:$businessId}')" \
    /tmp/lifecycle-account-blocked.json 409
  jq -e '.error=="record_has_related_records" and (.detail.contacts // 0)>=1 and (.detail.opportunities // 0)>=1' /tmp/lifecycle-account-blocked.json >/dev/null || fail "guarded Account delete did not report relation blockers"
  lifecycle_pass "$provider_label Account delete is fail-closed while Contact/Opportunity relations exist"

  lifecycle_request crm.ops.v1.contact.delete \
    "$(jq -nc --arg businessId "$contact_business_id" '{businessId:$businessId}')" \
    /tmp/lifecycle-contact-delete.json
  jq -e --arg id "$contact_business_id" '.result.deleted==true and .result.businessId==$id' /tmp/lifecycle-contact-delete.json >/dev/null || fail "Contact delete response mismatch"
  lifecycle_pass "$provider_label Contact provider record + durable mapping deleted"

  lifecycle_request crm.ops.v1.opportunity.delete \
    "$(jq -nc --arg businessId "$opportunity_business_id" '{businessId:$businessId}')" \
    /tmp/lifecycle-opportunity-delete.json
  jq -e --arg id "$opportunity_business_id" '.result.deleted==true and .result.businessId==$id' /tmp/lifecycle-opportunity-delete.json >/dev/null || fail "Opportunity delete response mismatch"
  lifecycle_pass "$provider_label Opportunity provider record + durable mapping deleted"

  lifecycle_request crm.ops.v1.account.delete \
    "$(jq -nc --arg businessId "$account_business_id" '{businessId:$businessId}')" \
    /tmp/lifecycle-account-delete.json
  jq -e --arg id "$account_business_id" '.result.deleted==true and .result.businessId==$id' /tmp/lifecycle-account-delete.json >/dev/null || fail "Account delete response mismatch"
  lifecycle_pass "$provider_label Account deletes only after relation blockers are cleared"

  lifecycle_request crm.v1.account.list '{"limit":500}' /tmp/lifecycle-account-list-after.json
  lifecycle_request crm.v1.contact.list '{"limit":500}' /tmp/lifecycle-contact-list-after.json
  lifecycle_request crm.v1.opportunity.list '{"limit":500}' /tmp/lifecycle-opportunity-list-after.json
  jq -e --arg name "$updated_name" '.result.records | map(.displayName) | index($name) == null' /tmp/lifecycle-account-list-after.json >/dev/null || fail "deleted Account still present in Twenty-backed list"
  jq -e --arg name "$contact_name" '.result.records | map(.personName) | index($name) == null' /tmp/lifecycle-contact-list-after.json >/dev/null || fail "deleted Contact still present in Twenty-backed list"
  jq -e --arg name "$opportunity_name" '.result.records | map(.nameSummary) | index($name) == null' /tmp/lifecycle-opportunity-list-after.json >/dev/null || fail "deleted Opportunity still present in Twenty-backed list"
  lifecycle_pass "$provider_label deleted records are absent from real Twenty-backed canonical lists"

  curl -fsS "$API/api/mappings" -H "authorization: Bearer $user_token" > /tmp/lifecycle-mappings-after.json
  for business_id in "$account_business_id" "$contact_business_id" "$opportunity_business_id"; do
    jq -e --arg providerId "$provider_id" --arg businessId "$business_id" '[.mappings[] | select(.provider_id==$providerId and .business_id==$businessId)] | length==0' /tmp/lifecycle-mappings-after.json >/dev/null || fail "deleted business mapping remains for $business_id"
  done
  lifecycle_pass "$provider_label delete path removes provider mappings only after upstream success"

  [[ "$pass_count" == "11" ]] || fail "record lifecycle conformance expected 11 assertions, got $pass_count"
  printf 'PASS — CRM record lifecycle conformance: provider=%s assertions=%d\n' "$provider_label" "$pass_count"
}
