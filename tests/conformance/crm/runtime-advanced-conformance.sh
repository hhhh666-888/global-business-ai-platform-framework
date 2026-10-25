#!/usr/bin/env bash

crm_runtime_advanced_conformance() {
  local admin_token="$1"
  local user_token="$2"
  local manager_token="$3"
  local provider_label="$4"
  local suffix="${GITHUB_RUN_ID:-local}-${RANDOM}"
  local pass_count=0

  advanced_pass() {
    pass_count=$((pass_count + 1))
    printf '[crm-runtime-advanced][PASS %02d] %s\n' "$pass_count" "$*"
  }
  advanced_json() {
    local method="$1" path="$2" body="$3" output="$4" expected="${5:-200}" token="${6:-$user_token}" status
    status="$(curl -sS --max-time 75 -o "$output" -w '%{http_code}' -X "$method" "$API$path" \
      -H "authorization: Bearer $token" -H 'content-type: application/json' --data "$body")"
    [[ "$status" == "$expected" ]] || fail "advanced CRM $method $path expected $expected, got $status: $(cat "$output")"
  }
  advanced_get() {
    local path="$1" output="$2" token="${3:-$user_token}" status
    status="$(curl -sS --max-time 75 -o "$output" -w '%{http_code}' "$API$path" -H "authorization: Bearer $token")"
    [[ "$status" == "200" ]] || fail "advanced CRM GET $path expected 200, got $status: $(cat "$output")"
  }

  advanced_get '/api/crm-runtime/views' /tmp/runtime-advanced-before-invalid.json "$manager_token"
  local view_count_before_invalid
  view_count_before_invalid="$(jq '.views|length' /tmp/runtime-advanced-before-invalid.json)"
  advanced_json POST '/api/crm-runtime/views' \
    "$(jq -nc --arg name "Invalid Calendar $suffix" '{objectKey:"company",name:$name,type:"CALENDAR",scope:"WORKSPACE",calendarFieldKey:null,calendarLayout:"MONTH",fields:[{fieldKey:"name",visible:true,position:0,size:180,aggregateOperation:null}],filterGroups:[],filters:[],sorts:[]}')" \
    /tmp/runtime-advanced-invalid-view.json 400 "$manager_token"
  advanced_get '/api/crm-runtime/views' /tmp/runtime-advanced-after-invalid.json "$manager_token"
  [[ "$(jq '.views|length' /tmp/runtime-advanced-after-invalid.json)" == "$view_count_before_invalid" ]] || fail "invalid View request partially mutated provider metadata"
  advanced_pass "$provider_label invalid Calendar View is rejected before provider metadata mutation"

  local personal_name="My Runtime View $suffix"
  advanced_json POST '/api/crm-runtime/views' \
    "$(jq -nc --arg name "$personal_name" '{objectKey:"company",name:$name,type:"TABLE",scope:"PERSONAL",fields:[{fieldKey:"name",visible:true,position:0,size:220,aggregateOperation:null},{fieldKey:"domainName",visible:true,position:1,size:220,aggregateOperation:null}],filterGroups:[],filters:[],sorts:[{fieldKey:"name",direction:"ASC",subFieldName:null}]}')" \
    /tmp/runtime-advanced-personal-view.json 201 "$user_token"
  local personal_view_key
  personal_view_key="$(jq -er '.viewKey' /tmp/runtime-advanced-personal-view.json)"
  [[ "$personal_view_key" == view:* ]] || fail "personal View did not return public runtime key"
  [[ ! "$personal_view_key" =~ [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{27} ]] || fail "personal View leaked provider UUID"
  advanced_pass "$provider_label employee created a provider-backed Personal View without provider ID exposure"

  advanced_get '/api/crm-runtime/views' /tmp/runtime-advanced-views-user.json "$user_token"
  jq -e --arg key "$personal_view_key" --arg name "$personal_name" '[.views[]|select(.viewKey==$key and .name==$name and .scope=="PERSONAL" and .owned==true and .editable==true)]|length==1' /tmp/runtime-advanced-views-user.json >/dev/null || fail "personal View missing from owner runtime list"
  jq -e '.deepViewConfig==true' /tmp/runtime-advanced-views-user.json >/dev/null || fail "deep View runtime marker missing"
  advanced_pass "$provider_label Personal View persisted and deep View runtime is active"

  advanced_json POST '/api/crm-runtime/views' \
    "$(jq -nc --arg name "Forbidden Workspace View $suffix" '{objectKey:"company",name:$name,type:"TABLE",scope:"WORKSPACE",fields:[{fieldKey:"name",visible:true,position:0,size:180,aggregateOperation:null}],filterGroups:[],filters:[],sorts:[]}')" \
    /tmp/runtime-advanced-view-forbidden.json 403 "$user_token"
  jq -e '.error=="workspace_view_requires_manager"' /tmp/runtime-advanced-view-forbidden.json >/dev/null || fail "employee Workspace View rejection mismatch"
  advanced_pass "$provider_label employee cannot publish Workspace View"

  local workspace_name="Shared Kanban Runtime View $suffix"
  advanced_json POST '/api/crm-runtime/views' \
    "$(jq -nc --arg name "$workspace_name" '{objectKey:"opportunity",name:$name,type:"KANBAN",scope:"WORKSPACE",mainGroupByFieldKey:"stage",hideEmptyGroups:true,kanbanAggregateOperation:"COUNT",kanbanAggregateFieldKey:"name",fields:[{fieldKey:"name",visible:true,position:0,size:240,aggregateOperation:null},{fieldKey:"stage",visible:true,position:1,size:180,aggregateOperation:null}],filterGroups:[],filters:[],sorts:[],groups:[{fieldValue:"NEW",visible:false,position:0}]}')" \
    /tmp/runtime-advanced-workspace-view.json 201 "$manager_token"
  local workspace_view_key
  workspace_view_key="$(jq -er '.viewKey' /tmp/runtime-advanced-workspace-view.json)"
  advanced_get '/api/crm-runtime/views' /tmp/runtime-advanced-workspace-visible.json "$user_token"
  jq -e --arg key "$workspace_view_key" '[.views[]|select(.viewKey==$key and .scope=="WORKSPACE" and .type=="KANBAN" and .mainGroupByFieldKey=="stage" and .kanbanAggregateOperation=="COUNT" and .hideEmptyGroups==true and (.groups|length)>=1 and .groups[0].fieldValue=="NEW" and .groups[0].visible==false)]|length==1' /tmp/runtime-advanced-workspace-visible.json >/dev/null || fail "manager-published deep Kanban View metadata mismatch"
  advanced_pass "$provider_label manager published native Kanban grouping/aggregate/group visibility metadata visible to employees"

  local updated_name="My Runtime View Updated $suffix"
  advanced_json PATCH "/api/crm-runtime/views/$personal_view_key" \
    "$(jq -nc --arg name "$updated_name" '{objectKey:"company",name:$name,type:"TABLE",scope:"PERSONAL",anyFieldFilterValue:"Runtime",fields:[{fieldKey:"name",visible:true,position:0,size:260,aggregateOperation:null},{fieldKey:"domainName",visible:true,position:1,size:220,aggregateOperation:null}],filterGroups:[{key:"root-or",parentKey:null,operator:"OR",position:0},{key:"child-and",parentKey:"root-or",operator:"AND",position:0}],filters:[{fieldKey:"name",operand:"CONTAINS",value:"Runtime",groupKey:"root-or",position:0,subFieldName:null},{fieldKey:"domainName",operand:"IS_NOT_EMPTY",value:"",groupKey:"child-and",position:0,subFieldName:null}],sorts:[{fieldKey:"name",direction:"DESC",subFieldName:null}]}')" \
    /tmp/runtime-advanced-view-update.json 200 "$user_token"
  advanced_get '/api/crm-runtime/views' /tmp/runtime-advanced-view-updated-list.json "$user_token"
  jq -e --arg key "$personal_view_key" --arg name "$updated_name" '
    [.views[]|select(
      .viewKey==$key and .name==$name and .anyFieldFilterValue=="Runtime" and
      (.fields|map(select(.fieldKey=="name" and .size==260))|length)==1 and
      (.filterGroups|length)==2 and
      (.filterGroups|map(select(.operator=="OR" and .parentKey==null))|length)==1 and
      (.filterGroups|map(select(.operator=="AND" and .parentKey!=null))|length)==1 and
      (.filters|length)==2 and
      (.filters|map(select(.groupKey!=null))|length)==2 and
      .sorts[0].direction=="DESC"
    )]|length==1' /tmp/runtime-advanced-view-updated-list.json >/dev/null || fail "deep View filter-group/field-width/filter/sort persistence mismatch"
  advanced_pass "$provider_label nested AND/OR filter groups, field width, View search and sort persisted through Twenty metadata"

  advanced_json DELETE "/api/crm-runtime/views/$personal_view_key" '{}' /tmp/runtime-advanced-view-delete.json 200 "$user_token"
  advanced_get '/api/crm-runtime/views' /tmp/runtime-advanced-view-after-delete.json "$user_token"
  jq -e --arg key "$personal_view_key" '[.views[]|select(.viewKey==$key)]|length==0' /tmp/runtime-advanced-view-after-delete.json >/dev/null || fail "deleted Personal View still visible"
  advanced_pass "$provider_label owner deleted Personal View through governed runtime"

  local company_a="Merge Survivor $suffix" company_b="Merge Duplicate $suffix"
  advanced_json POST '/api/crm-runtime/objects/company/records' "$(jq -nc --arg name "$company_a" '{fields:{name:$name}}')" /tmp/runtime-merge-a.json 201 "$user_token"
  advanced_json POST '/api/crm-runtime/objects/company/records' "$(jq -nc --arg name "$company_b" '{fields:{name:$name}}')" /tmp/runtime-merge-b.json 201 "$user_token"
  local business_a business_b
  business_a="$(jq -er '.record.businessId' /tmp/runtime-merge-a.json)"
  business_b="$(jq -er '.record.businessId' /tmp/runtime-merge-b.json)"
  local file_payload
  file_payload="$(printf 'merge-file-%s' "$suffix" | base64 -w0)"
  advanced_json POST "/api/crm-runtime/objects/company/records/$business_b/files" \
    "$(jq -nc --arg content "$file_payload" '{fileName:"merge-proof.txt",mimeType:"text/plain",sizeBytes:0,contentBase64:$content}' | jq '.sizeBytes=(.contentBase64|@base64d|length)')" \
    /tmp/runtime-merge-file.json 201 "$user_token"
  local merge_file_id
  merge_file_id="$(jq -er '.file.id' /tmp/runtime-merge-file.json)"

  advanced_json POST '/api/crm-runtime/objects/company/merge' \
    "$(jq -nc --arg a "$business_a" --arg b "$business_b" '{businessIds:[$a,$b],survivorBusinessId:$a,dryRun:true}')" \
    /tmp/runtime-merge-preview.json 200 "$manager_token"
  jq -e --arg a "$business_a" --arg b "$business_b" '.dryRun==true and .mergeAllowed==true and .survivorBusinessId==$a and (.sourceBusinessIds|index($b))!=null and (.conflicts|type)=="array"' /tmp/runtime-merge-preview.json >/dev/null || fail "native merge dry-run preview mismatch"
  curl -fsS "$API/api/mappings" -H "authorization: Bearer $admin_token" > /tmp/runtime-merge-preview-mappings.json
  jq -e --arg b "$business_b" '[.mappings[]|select(.business_id==$b)]|length==1' /tmp/runtime-merge-preview-mappings.json >/dev/null || fail "dry-run mutated duplicate mapping"
  advanced_get "/api/crm-runtime/objects/company/records/$business_b/context" /tmp/runtime-merge-preview-context.json "$user_token"
  jq -e --arg id "$merge_file_id" '[.files[]|select(.id==$id)]|length==1' /tmp/runtime-merge-preview-context.json >/dev/null || fail "dry-run migrated or removed duplicate attachment"
  advanced_pass "$provider_label Merge dry-run previews conflicts without mutating provider mapping or GBAP attachment ownership"

  advanced_json POST '/api/crm-runtime/objects/company/merge' \
    "$(jq -nc --arg a "$business_a" --arg b "$business_b" '{businessIds:[$a,$b],survivorBusinessId:$a,dryRun:false}')" \
    /tmp/runtime-merge-result.json 200 "$manager_token"
  jq -e --arg a "$business_a" --arg b "$business_b" '.merged==true and .survivorBusinessId==$a and (.mergedBusinessIds|index($b))!=null' /tmp/runtime-merge-result.json >/dev/null || fail "native merge response mismatch"
  advanced_get "/api/crm-runtime/objects/company/records/$business_a/context" /tmp/runtime-merge-context.json "$user_token"
  jq -e --arg id "$merge_file_id" '[.files[]|select(.id==$id)]|length==1' /tmp/runtime-merge-context.json >/dev/null || fail "GBAP attachment was not migrated to merge survivor"
  curl -fsS "$API/api/mappings" -H "authorization: Bearer $admin_token" > /tmp/runtime-merge-mappings.json
  jq -e --arg b "$business_b" '[.mappings[]|select(.business_id==$b)]|length==0' /tmp/runtime-merge-mappings.json >/dev/null || fail "duplicate business mapping remains after merge"
  advanced_pass "$provider_label native Merge preserves survivor businessId, removes duplicate mapping and migrates GBAP attachments"

  advanced_json DELETE "/api/crm-runtime/objects/company/records/$business_a" '{}' /tmp/runtime-merge-survivor-delete.json 200 "$user_token"
  advanced_json POST "/api/crm-runtime/objects/company/records/$business_a/destroy" '{}' /tmp/runtime-merge-destroy-blocked.json 409 "$admin_token"
  jq -e '.error=="runtime_destroy_has_gbap_attachments" and (.detail.attachments//0)>=1' /tmp/runtime-merge-destroy-blocked.json >/dev/null || fail "destroy attachment guard mismatch"
  advanced_pass "$provider_label permanent destroy is fail-closed while GBAP attachments exist"

  local delete_file_status
  delete_file_status="$(curl -sS --max-time 30 -o /tmp/runtime-merge-file-delete.json -w '%{http_code}' -X DELETE "$API/api/crm-native/files/$merge_file_id" -H "authorization: Bearer $admin_token")"
  [[ "$delete_file_status" == "200" ]] || fail "merge proof file cleanup failed: $delete_file_status $(cat /tmp/runtime-merge-file-delete.json)"
  advanced_json POST "/api/crm-native/files/$merge_file_id/destroy" '{}' /tmp/runtime-merge-file-destroy.json 200 "$admin_token"
  jq -e --arg id "$merge_file_id" '.destroyed==$id' /tmp/runtime-merge-file-destroy.json >/dev/null || fail "merge proof file permanent cleanup mismatch"
  advanced_json POST "/api/crm-runtime/objects/company/records/$business_a/destroy" '{}' /tmp/runtime-merge-destroy-final.json 200 "$admin_token"
  jq -e --arg id "$business_a" '.destroyed==true and .businessId==$id' /tmp/runtime-merge-destroy-final.json >/dev/null || fail "destroy after attachment cleanup mismatch"
  advanced_pass "$provider_label permanent destroy succeeds only after attachment cleanup"

  advanced_json DELETE "/api/crm-runtime/views/$workspace_view_key" '{}' /tmp/runtime-workspace-view-delete.json 200 "$manager_token"
  advanced_pass "$provider_label manager cleaned Workspace View after proof"

  [[ "$pass_count" == "12" ]] || fail "CRM runtime advanced conformance expected 12 assertions, got $pass_count"
  printf 'PASS — CRM advanced runtime conformance: provider=%s assertions=%d\n' "$provider_label" "$pass_count"

  source "$ROOT/tests/conformance/crm/runtime-permission-conformance.sh"
  crm_runtime_permission_conformance "$user_token" "$provider_label"
}
