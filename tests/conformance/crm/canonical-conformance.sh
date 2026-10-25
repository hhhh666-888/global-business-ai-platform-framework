#!/usr/bin/env bash

canonical_crm_conformance() {
  local provider_id="$1"
  local admin_token="$2"
  local user_token="$3"
  local provider_label="$4"
  local suffix="${GITHUB_RUN_ID:-local}-${RANDOM}"
  local pass_count=0

  canonical_pass() {
    pass_count=$((pass_count + 1))
    printf '[canonical-crm][PASS %02d] %s\n' "$pass_count" "$*"
  }

  canonical_request() {
    local capability="$1" payload="$2" output="$3"
    local status
    status="$(curl -sS --max-time 30 -o "$output" -w '%{http_code}' \
      -X POST "$API/api/capabilities/$capability/invoke" \
      -H "authorization: Bearer $user_token" \
      -H 'content-type: application/json' \
      --data "$(jq -nc --argjson payload "$payload" '{payload:$payload}')")"
    [[ "$status" == "200" ]] || fail "canonical $capability expected 200, got $status: $(cat "$output")"
  }

  local account_business_id="GBAP-CONF-ACC-$suffix"
  local contact_business_id="GBAP-CONF-CONTACT-$suffix"
  local opportunity_business_id="GBAP-CONF-OPP-$suffix"
  local account_name="GBAP Canonical Account $suffix"
  local contact_name="Maria Canonical $suffix"
  local opportunity_name="Integrated Energy Opportunity $suffix"

  canonical_request crm.v1.account.create \
    "$(jq -nc --arg businessId "$account_business_id" --arg displayName "$account_name" '{businessId:$businessId,displayName:$displayName}')" \
    /tmp/canonical-account.json
  jq -e --arg businessId "$account_business_id" --arg displayName "$account_name" '.result.record.businessId==$businessId and .result.record.businessType=="Account" and .result.record.displayName==$displayName and (.result.record.externalId|length)>0' /tmp/canonical-account.json >/dev/null || fail "canonical account response mismatch"
  local account_external_id
  account_external_id="$(jq -er '.result.record.externalId' /tmp/canonical-account.json)"
  local map_account
  map_account="$(jq -er '.result.record.mappingId' /tmp/canonical-account.json)"
  canonical_pass "$provider_label canonical Account create + automatic durable mapping"

  canonical_request crm.v1.contact.create \
    "$(jq -nc --arg businessId "$contact_business_id" --arg personName "$contact_name" '{businessId:$businessId,personName:$personName}')" \
    /tmp/canonical-contact.json
  jq -e --arg businessId "$contact_business_id" --arg personName "$contact_name" '.result.record.businessId==$businessId and .result.record.businessType=="Contact" and .result.record.personName==$personName and (.result.record.externalId|length)>0' /tmp/canonical-contact.json >/dev/null || fail "canonical contact response/mapping mismatch"
  local map_contact
  map_contact="$(jq -er '.result.record.mappingId' /tmp/canonical-contact.json)"
  canonical_pass "$provider_label canonical Contact remains an independent GBAP business entity"

  local status
  status="$(curl -sS --max-time 10 -o /tmp/canonical-open-without-account.json -w '%{http_code}' \
    -X POST "$API/api/capabilities/crm.v1.opportunity.create/invoke" \
    -H "authorization: Bearer $user_token" -H 'content-type: application/json' \
    --data "$(jq -nc --arg businessId "GBAP-CONF-OPP-NO-ACCOUNT-$suffix" --arg nameSummary "$opportunity_name" '{payload:{businessId:$businessId,nameSummary:$nameSummary,lifecycleState:"OPEN"}}')")"
  [[ "$status" == "409" ]] || fail "OPEN Opportunity without Account expected 409, got $status: $(cat /tmp/canonical-open-without-account.json)"
  jq -e '.error=="canonical_relation_required:Account"' /tmp/canonical-open-without-account.json >/dev/null || fail "OPEN Opportunity Account gate error mismatch"
  canonical_pass "$provider_label OPEN Opportunity is rejected without the frozen Account gate"

  status="$(curl -sS --max-time 10 -o /tmp/canonical-lead-rejected.json -w '%{http_code}' \
    -X POST "$API/api/capabilities/crm.v1.lead.create/invoke" \
    -H "authorization: Bearer $user_token" -H 'content-type: application/json' \
    --data '{"payload":{"businessId":"GBAP-NOT-A-V1-LEAD"}}')"
  [[ "$status" == "503" ]] || fail "canonical Lead capability should be unavailable, got $status: $(cat /tmp/canonical-lead-rejected.json)"
  jq -e '.error=="capability_unavailable" and .capability=="crm.v1.lead.create"' /tmp/canonical-lead-rejected.json >/dev/null || fail "canonical Lead exclusion response mismatch"
  canonical_pass "$provider_label provider-native Lead is not promoted into the GBAP V1 canonical contract"

  canonical_request crm.v1.opportunity.create \
    "$(jq -nc --arg businessId "$opportunity_business_id" --arg accountBusinessId "$account_business_id" --arg nameSummary "$opportunity_name" '{businessId:$businessId,nameSummary:$nameSummary,lifecycleState:"OPEN",accountBusinessId:$accountBusinessId,nextStep:"Qualification"}')" \
    /tmp/canonical-opportunity.json
  jq -e --arg businessId "$opportunity_business_id" --arg accountExternalId "$account_external_id" '.result.record.businessId==$businessId and .result.record.businessType=="Opportunity" and .result.record.accountExternalId==$accountExternalId' /tmp/canonical-opportunity.json >/dev/null || fail "canonical opportunity account relation mismatch"
  local map_opp
  map_opp="$(jq -er '.result.record.mappingId' /tmp/canonical-opportunity.json)"
  canonical_pass "$provider_label canonical OPEN Opportunity resolved Account durable ID"

  jq -e --arg nameSummary "$opportunity_name" '.result.record.nameSummary==$nameSummary and .result.record.lifecycleState=="OPEN"' /tmp/canonical-opportunity.json >/dev/null || fail "canonical opportunity frozen name_summary/lifecycle semantics mismatch"
  canonical_pass "$provider_label canonical Opportunity preserves frozen name_summary + lifecycle semantics"

  canonical_request crm.v1.account.list '{"limit":500}' /tmp/canonical-accounts.json
  canonical_request crm.v1.contact.list '{"limit":500}' /tmp/canonical-contacts.json
  canonical_request crm.v1.opportunity.list '{"limit":500}' /tmp/canonical-opportunities.json
  jq -e --arg id "$account_business_id" '.result.records | map(.businessId) | index($id) != null' /tmp/canonical-accounts.json >/dev/null || fail "canonical account list missing durable businessId"
  jq -e --arg id "$contact_business_id" '.result.records | map(.businessId) | index($id) != null' /tmp/canonical-contacts.json >/dev/null || fail "canonical contact list missing durable businessId"
  jq -e --arg id "$opportunity_business_id" --arg nameSummary "$opportunity_name" '.result.records | map(select(.businessId==$id and .nameSummary==$nameSummary and .lifecycleState=="OPEN")) | length==1' /tmp/canonical-opportunities.json >/dev/null || fail "canonical opportunity list missing frozen semantics"
  canonical_pass "$provider_label canonical lists reverse-resolve provider IDs to GBAP IDs"

  canonical_request crm.v1.snapshot.export '{}' /tmp/canonical-export.json
  jq -e --arg acc "$account_business_id" --arg contact "$contact_business_id" --arg opp "$opportunity_business_id" --arg nameSummary "$opportunity_name" '
    .result.snapshot.contractVersion=="gbap.crm.v1" and
    (.result.snapshot.accounts | map(.businessId) | index($acc) != null) and
    (.result.snapshot.contacts | map(.businessId) | index($contact) != null) and
    (.result.snapshot.opportunities | map(select(.businessId==$opp and .nameSummary==$nameSummary and .lifecycleState=="OPEN")) | length==1)
  ' /tmp/canonical-export.json >/dev/null || fail "canonical snapshot missing durable business IDs or frozen Opportunity semantics"
  canonical_pass "$provider_label provider-neutral canonical export contains Account/Contact/Opportunity truth"

  curl -fsS "$API/api/mappings" -H "authorization: Bearer $user_token" > /tmp/canonical-mappings.json
  for business_id in "$account_business_id" "$contact_business_id" "$opportunity_business_id"; do
    jq -e --arg providerId "$provider_id" --arg businessId "$business_id" '.mappings[] | select(.provider_id==$providerId and .business_id==$businessId)' /tmp/canonical-mappings.json >/dev/null || fail "mapping missing for $business_id"
  done
  canonical_pass "$provider_label canonical create path persisted all three mappings"

  local export_digest
  export_digest="sha256:$(sha256sum /tmp/canonical-export.json | awk '{print $1}')"
  local evidence_ref="github-actions:${GITHUB_RUN_ID:-local}/${provider_id}/canonical-export"
  status="$(curl -sS --max-time 10 -o /tmp/canonical-evidence.json -w '%{http_code}' \
    -X POST "$API/api/providers/$provider_id/replacement-evidence/advance" \
    -H "authorization: Bearer $admin_token" \
    -H 'content-type: application/json' \
    --data "$(jq -nc --arg evidenceRef "$evidence_ref" --arg evidenceDigest "$export_digest" '{toLevel:"E1",evidenceRef:$evidenceRef,evidenceDigest:$evidenceDigest,decisionRef:"contracts/crm/v1/contract.json",scope:{contractVersion:"gbap.crm.v1",businessTypes:["Account","Contact","Opportunity"],evidenceClass:"E1_EXPORT"}}')")"
  [[ "$status" == "200" ]] || fail "evidence-governed E1 advance failed: $status $(cat /tmp/canonical-evidence.json)"
  jq -e '.provider.replacementEvidence=="E1" and .transition.fromLevel=="E0" and .transition.toLevel=="E1" and .transition.scope.contractVersion=="gbap.crm.v1" and (.transition.provenance.upstreamProduct|length)>0 and (.transition.provenance.upstreamVersion|length)>0 and (.transition.provenance.adapterRevision|length)>0 and ((.transition.provenance.upstreamCommit|length)>0 or (.transition.provenance.upstreamImageDigest|startswith("sha256:")))' /tmp/canonical-evidence.json >/dev/null || fail "replacement evidence transition scope/provenance mismatch"
  canonical_pass "$provider_label E0 -> E1 required evidence + scope + immutable integration provenance"

  curl -fsS "$API/api/providers/$provider_id/replacement-evidence" -H "authorization: Bearer $user_token" > /tmp/canonical-evidence-history.json
  jq -e '.currentLevel=="E1" and (.history|length)==1 and .history[0].toLevel=="E1" and .history[0].scope.evidenceClass=="E1_EXPORT" and .history[0].provenance.contractVersion=="gbap.crm.v1"' /tmp/canonical-evidence-history.json >/dev/null || fail "replacement evidence history mismatch"
  canonical_pass "$provider_label replacement evidence history retains scope + provenance snapshot"

  curl -fsS "$API/api/providers" -H "authorization: Bearer $user_token" > /tmp/canonical-providers.json
  jq -e --arg providerId "$provider_id" '.providers[] | select(.id==$providerId) | .provenance.contractVersion=="gbap.crm.v1" and (.provenance.upstreamProduct|length)>0 and (.provenance.upstreamVersion|length)>0 and (.provenance.adapterRevision|length)>0 and ((.provenance.upstreamCommit|length)>0 or (.provenance.upstreamImageDigest|startswith("sha256:")))' /tmp/canonical-providers.json >/dev/null || fail "normalized provider provenance missing"
  canonical_pass "$provider_label normalized product/version/commit-or-image/adapter provenance is registered"

  curl -fsS "$API/api/audit" -H "authorization: Bearer $admin_token" > /tmp/canonical-audit.json
  jq -e '.events | map(.action) | index("provider.replacement_evidence.advance") != null' /tmp/canonical-audit.json >/dev/null || fail "audit missing evidence advance"
  jq -e '.events | map(.action) | index("mapping.create") != null' /tmp/canonical-audit.json >/dev/null || fail "audit missing canonical mapping creation"
  canonical_pass "$provider_label canonical mapping + replacement evidence actions are audited"

  for mapping_id in "$map_opp" "$map_contact" "$map_account"; do
    status="$(curl -sS --max-time 10 -o /tmp/canonical-map-delete.json -w '%{http_code}' \
      -X DELETE "$API/api/mappings/$mapping_id" -H "authorization: Bearer $admin_token")"
    [[ "$status" == "200" ]] || fail "canonical mapping cleanup failed for $mapping_id: $status"
  done
  canonical_pass "$provider_label conformance mappings released through governed API"

  [[ "$pass_count" == "14" ]] || fail "canonical conformance expected 14 assertions, got $pass_count"
  printf 'PASS — Canonical CRM v1 conformance: provider=%s assertions=%d\n' "$provider_label" "$pass_count"
}
