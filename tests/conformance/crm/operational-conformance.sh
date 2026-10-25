#!/usr/bin/env bash

crm_operational_conformance() {
  local provider_id="$1"
  local admin_token="$2"
  local user_token="$3"
  local provider_label="$4"
  local suffix="${GITHUB_RUN_ID:-local}-${RANDOM}"
  local pass_count=0

  ops_pass() {
    pass_count=$((pass_count + 1))
    printf '[crm-ops][PASS %02d] %s\n' "$pass_count" "$*"
  }

  ops_request() {
    local capability="$1" payload="$2" output="$3"
    local status
    status="$(curl -sS --max-time 30 -o "$output" -w '%{http_code}' \
      -X POST "$API/api/capabilities/$capability/invoke" \
      -H "authorization: Bearer $user_token" \
      -H 'content-type: application/json' \
      --data "$(jq -nc --argjson payload "$payload" '{payload:$payload}')")"
    [[ "$status" == "200" ]] || fail "operational $capability expected 200, got $status: $(cat "$output")"
  }

  local account_business_id="GBAP-OPS-ACC-$suffix"
  local task_business_id="GBAP-OPS-TASK-$suffix"
  local note_business_id="GBAP-OPS-NOTE-$suffix"
  local contact_business_id="GBAP-OPS-CON-$suffix"
  local opportunity_business_id="GBAP-OPS-OPP-$suffix"
  local account_name="GBAP Ops Account $suffix"
  local task_title="Follow up energy bill $suffix"
  local note_title="Customer energy note $suffix"
  local contact_name="Ops Contact $suffix"
  local opportunity_name="Ops Energy Project $suffix"

  ops_request crm.v1.account.create \
    "$(jq -nc --arg businessId "$account_business_id" --arg displayName "$account_name" '{businessId:$businessId,displayName:$displayName}')" \
    /tmp/ops-account.json
  jq -e --arg id "$account_business_id" '.result.record.businessId==$id and .result.record.businessType=="Account"' /tmp/ops-account.json >/dev/null || fail "operational prerequisite Account mismatch"
  local account_mapping_id
  account_mapping_id="$(jq -er '.result.record.mappingId' /tmp/ops-account.json)"
  ops_pass "$provider_label operational prerequisite uses canonical GBAP Account identity"

  ops_request crm.ops.v1.task.create \
    "$(jq -nc --arg businessId "$task_business_id" --arg title "$task_title" --arg accountId "$account_business_id" '{businessId:$businessId,title:$title,bodyMarkdown:"Request the latest 12-month bill.",status:"TODO",targets:[{businessType:"Account",businessId:$accountId}]}')" \
    /tmp/ops-task-create.json
  jq -e --arg id "$task_business_id" --arg title "$task_title" --arg accountId "$account_business_id" '
    .result.record.businessId==$id and
    .result.record.businessType=="CrmTask" and
    .result.record.title==$title and
    .result.record.status=="TODO" and
    (.result.record | has("externalId") | not) and
    (.result.record | has("externalType") | not) and
    (.result.record.targets | map(select(.businessType=="Account" and .businessId==$accountId)) | length)==1
  ' /tmp/ops-task-create.json >/dev/null || fail "operational Task create did not preserve GBAP identity/target boundary"
  ops_pass "$provider_label Task create uses GBAP task + Account IDs and hides provider record IDs"

  ops_request crm.ops.v1.task.list '{"limit":100}' /tmp/ops-task-list.json
  jq -e --arg id "$task_business_id" --arg accountId "$account_business_id" '
    .result.records | map(select(
      .businessId==$id and .businessType=="CrmTask" and .status=="TODO" and
      (. | has("externalId") | not) and
      (.targets | map(select(.businessType=="Account" and .businessId==$accountId)) | length)==1
    )) | length==1
  ' /tmp/ops-task-list.json >/dev/null || fail "operational Task list missing reverse-resolved identity/target"
  ops_pass "$provider_label Task list reverse-resolves provider identity and relation to GBAP IDs"

  ops_request crm.ops.v1.task.update \
    "$(jq -nc --arg businessId "$task_business_id" '{businessId:$businessId,status:"DONE"}')" \
    /tmp/ops-task-update.json
  jq -e --arg id "$task_business_id" '.result.record.businessId==$id and .result.record.businessType=="CrmTask" and .result.record.status=="DONE" and (.result.record|has("externalId")|not)' /tmp/ops-task-update.json >/dev/null || fail "operational Task update through businessId failed"
  ops_pass "$provider_label Task update accepts GBAP operational ID and persists DONE status"

  ops_request crm.ops.v1.note.create \
    "$(jq -nc --arg businessId "$note_business_id" --arg title "$note_title" --arg accountId "$account_business_id" '{businessId:$businessId,title:$title,bodyMarkdown:"Customer prefers phased solar plus storage.",targets:[{businessType:"Account",businessId:$accountId}]}')" \
    /tmp/ops-note-create.json
  jq -e --arg id "$note_business_id" --arg title "$note_title" --arg accountId "$account_business_id" '
    .result.record.businessId==$id and
    .result.record.businessType=="CrmNote" and
    .result.record.title==$title and
    (.result.record | has("externalId") | not) and
    (.result.record.targets | map(select(.businessType=="Account" and .businessId==$accountId)) | length)==1
  ' /tmp/ops-note-create.json >/dev/null || fail "operational Note create did not preserve GBAP identity/target boundary"
  ops_pass "$provider_label Note create uses GBAP note + Account IDs and hides provider record IDs"

  ops_request crm.ops.v1.note.list '{"limit":100}' /tmp/ops-note-list.json
  jq -e --arg id "$note_business_id" --arg accountId "$account_business_id" '
    .result.records | map(select(
      .businessId==$id and .businessType=="CrmNote" and
      (. | has("externalId") | not) and
      (.targets | map(select(.businessType=="Account" and .businessId==$accountId)) | length)==1
    )) | length==1
  ' /tmp/ops-note-list.json >/dev/null || fail "operational Note list missing reverse-resolved identity/target"
  ops_pass "$provider_label Note list reverse-resolves provider identity and relation to GBAP IDs"

  local edited_note_title="$note_title edited"
  ops_request crm.ops.v1.note.update \
    "$(jq -nc --arg businessId "$note_business_id" --arg title "$edited_note_title" '{businessId:$businessId,title:$title,bodyMarkdown:"Updated business note."}')" \
    /tmp/ops-note-update.json
  jq -e --arg id "$note_business_id" --arg title "$edited_note_title" '.result.record.businessId==$id and .result.record.businessType=="CrmNote" and .result.record.title==$title and (.result.record|has("externalId")|not)' /tmp/ops-note-update.json >/dev/null || fail "operational Note update through businessId failed"
  ops_pass "$provider_label Note update accepts GBAP operational ID"

  ops_request crm.ops.v1.activity.list '{"limit":100}' /tmp/ops-activity.json
  jq -e --arg taskId "$task_business_id" --arg noteId "$note_business_id" '
    (.result.records | map(select(.kind=="TASK" and .businessId==$taskId and .businessType=="CrmTask")) | length)==1 and
    (.result.records | map(select(.kind=="NOTE" and .businessId==$noteId and .businessType=="CrmNote")) | length)==1 and
    (.result.records | map(has("externalId")) | any | not)
  ' /tmp/ops-activity.json >/dev/null || fail "activity aggregate missing GBAP Task/Note identity"
  ops_pass "$provider_label activity aggregate is real Task/Note data with GBAP-facing identity"

  curl -fsS "$API/api/mappings" -H "authorization: Bearer $user_token" > /tmp/ops-mappings.json
  local task_mapping_id note_mapping_id
  task_mapping_id="$(jq -er --arg providerId "$provider_id" --arg businessId "$task_business_id" '.mappings[] | select(.provider_id==$providerId and .business_type=="CrmTask" and .business_id==$businessId) | .id' /tmp/ops-mappings.json)"
  note_mapping_id="$(jq -er --arg providerId "$provider_id" --arg businessId "$note_business_id" '.mappings[] | select(.provider_id==$providerId and .business_type=="CrmNote" and .business_id==$businessId) | .id' /tmp/ops-mappings.json)"
  [[ -n "$task_mapping_id" && -n "$note_mapping_id" ]] || fail "operational durable mappings missing"
  ops_pass "$provider_label Task and Note durable operational mappings persisted"

  ops_request crm.v1.contact.create \
    "$(jq -nc --arg businessId "$contact_business_id" --arg personName "$contact_name" '{businessId:$businessId,personName:$personName,email:"ops.initial@example.com"}')" \
    /tmp/ops-contact-create.json
  jq -e --arg id "$contact_business_id" '.result.record.businessId==$id and .result.record.businessType=="Contact"' /tmp/ops-contact-create.json >/dev/null || fail "operational prerequisite Contact mismatch"
  local contact_mapping_id
  contact_mapping_id="$(jq -er '.result.record.mappingId' /tmp/ops-contact-create.json)"
  ops_pass "$provider_label Contact mutation prerequisite starts from canonical GBAP identity"

  local edited_contact_name="$contact_name Updated"
  ops_request crm.ops.v1.contact.update \
    "$(jq -nc --arg businessId "$contact_business_id" --arg personName "$edited_contact_name" --arg accountId "$account_business_id" '{businessId:$businessId,personName:$personName,email:"ops.updated@example.com",accountBusinessId:$accountId}')" \
    /tmp/ops-contact-update.json
  jq -e --arg id "$contact_business_id" --arg name "$edited_contact_name" --arg accountId "$account_business_id" '
    .result.record.businessId==$id and .result.record.businessType=="Contact" and
    .result.record.personName==$name and .result.record.email=="ops.updated@example.com" and
    .result.record.accountBusinessId==$accountId
  ' /tmp/ops-contact-update.json >/dev/null || fail "Contact update did not preserve GBAP identity/company relation"
  ops_pass "$provider_label Contact update persists business fields and Account relation through GBAP IDs"

  ops_request crm.v1.contact.list '{"limit":100}' /tmp/ops-contact-list.json
  jq -e --arg id "$contact_business_id" --arg name "$edited_contact_name" --arg accountId "$account_business_id" '
    .result.records | map(select(.businessId==$id and .personName==$name and .email=="ops.updated@example.com" and .accountBusinessId==$accountId)) | length==1
  ' /tmp/ops-contact-list.json >/dev/null || fail "Contact list did not reverse-resolve updated Account relation"
  ops_pass "$provider_label Contact list returns the updated relation using GBAP Account identity"

  ops_request crm.v1.opportunity.create \
    "$(jq -nc --arg businessId "$opportunity_business_id" --arg nameSummary "$opportunity_name" --arg accountId "$account_business_id" '{businessId:$businessId,nameSummary:$nameSummary,lifecycleState:"OPEN",accountBusinessId:$accountId,estimatedValue:125000,currencyCode:"USD"}')" \
    /tmp/ops-opportunity-create.json
  jq -e --arg id "$opportunity_business_id" '
    .result.record.businessId==$id and .result.record.businessType=="Opportunity" and
    .result.record.lifecycleState=="OPEN" and
    (.result.record.accountExternalId | type=="string" and length>0)
  ' /tmp/ops-opportunity-create.json >/dev/null || fail "operational prerequisite Opportunity mismatch"
  local opportunity_mapping_id
  opportunity_mapping_id="$(jq -er '.result.record.mappingId' /tmp/ops-opportunity-create.json)"
  ops_pass "$provider_label Opportunity mutation prerequisite starts from canonical OPEN business truth"

  local edited_opportunity_name="$opportunity_name Revised"
  ops_request crm.ops.v1.opportunity.update \
    "$(jq -nc --arg businessId "$opportunity_business_id" --arg nameSummary "$edited_opportunity_name" --arg accountId "$account_business_id" '{businessId:$businessId,nameSummary:$nameSummary,accountBusinessId:$accountId,estimatedValue:145000,currencyCode:"USD",pipelineStage:"PROPOSAL",lifecycleState:"CLOSED_LOST",nextStep:"Re-engage next quarter"}')" \
    /tmp/ops-opportunity-update.json
  jq -e --arg id "$opportunity_business_id" --arg name "$edited_opportunity_name" --arg accountId "$account_business_id" '
    .result.record.businessId==$id and .result.record.businessType=="Opportunity" and
    .result.record.nameSummary==$name and .result.record.accountBusinessId==$accountId and
    .result.record.estimatedValue==145000 and .result.record.currencyCode=="USD" and
    .result.record.pipelineStage=="PROPOSAL" and .result.record.lifecycleState=="CLOSED_LOST" and
    .result.record.nextStep=="Re-engage next quarter"
  ' /tmp/ops-opportunity-update.json >/dev/null || fail "Opportunity update lost provider stage or GBAP lifecycle semantics"
  ops_pass "$provider_label Opportunity update keeps provider pipeline stage and exact GBAP lifecycle/next-step truth"

  ops_request crm.v1.opportunity.list '{"limit":100}' /tmp/ops-opportunity-list.json
  jq -e --arg id "$opportunity_business_id" --arg name "$edited_opportunity_name" --arg accountId "$account_business_id" '
    .result.records | map(select(
      .businessId==$id and .nameSummary==$name and .accountBusinessId==$accountId and
      .estimatedValue==145000 and .pipelineStage=="PROPOSAL" and
      .lifecycleState=="CLOSED_LOST" and .nextStep=="Re-engage next quarter"
    )) | length==1
  ' /tmp/ops-opportunity-list.json >/dev/null || fail "Opportunity list did not restore GBAP lifecycle/relation truth"
  ops_pass "$provider_label Opportunity list rehydrates provider data with GBAP lifecycle and Account identity"

  curl -fsS "$API/api/mappings" -H "authorization: Bearer $user_token" > /tmp/ops-mappings-expanded.json
  [[ "$(jq -r --arg providerId "$provider_id" --arg businessId "$contact_business_id" '.mappings[] | select(.provider_id==$providerId and .business_type=="Contact" and .business_id==$businessId) | .id' /tmp/ops-mappings-expanded.json)" == "$contact_mapping_id" ]] || fail "Contact durable mapping missing after mutation"
  [[ "$(jq -r --arg providerId "$provider_id" --arg businessId "$opportunity_business_id" '.mappings[] | select(.provider_id==$providerId and .business_type=="Opportunity" and .business_id==$businessId) | .id' /tmp/ops-mappings-expanded.json)" == "$opportunity_mapping_id" ]] || fail "Opportunity durable mapping missing after mutation"
  ops_pass "$provider_label Contact and Opportunity mutations preserve existing durable mappings"

  local status
  for mapping_id in "$task_mapping_id" "$note_mapping_id" "$contact_mapping_id" "$opportunity_mapping_id" "$account_mapping_id"; do
    status="$(curl -sS --max-time 10 -o /tmp/ops-map-delete.json -w '%{http_code}' \
      -X DELETE "$API/api/mappings/$mapping_id" -H "authorization: Bearer $admin_token")"
    [[ "$status" == "200" ]] || fail "operational mapping cleanup failed for $mapping_id: $status $(cat /tmp/ops-map-delete.json)"
  done
  ops_pass "$provider_label operational conformance mappings released through governed API"

  [[ "$pass_count" == "17" ]] || fail "operational conformance expected 17 assertions, got $pass_count"
  printf 'PASS — CRM operational conformance: provider=%s assertions=%d\n' "$provider_label" "$pass_count"
}
