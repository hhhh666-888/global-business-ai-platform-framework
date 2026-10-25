#!/usr/bin/env bash

crm_native_product_conformance() {
  local admin_token="$1"
  local user_token="$2"
  local provider_label="$3"
  local suffix="${GITHUB_RUN_ID:-local}-${RANDOM}"
  local pass_count=0

  native_pass() {
    pass_count=$((pass_count + 1))
    printf '[crm-native][PASS %02d] %s\n' "$pass_count" "$*"
  }

  native_request() {
    local method="$1" path="$2" body="$3" output="$4" expected="$5" token="$6"
    local args=(-sS --max-time 30 -o "$output" -w '%{http_code}' -X "$method" "$API$path" -H "authorization: Bearer $token")
    if [[ -n "$body" ]]; then args+=(-H 'content-type: application/json' --data "$body"); fi
    local status
    status="$(curl "${args[@]}")"
    [[ "$status" == "$expected" ]] || fail "native CRM $method $path expected $expected, got $status: $(cat "$output")"
  }

  local account_business_id="GBAP-NATIVE-ACC-$suffix"
  local account_name="GBAP Native File Account $suffix"
  local create_payload
  create_payload="$(jq -nc --arg businessId "$account_business_id" --arg displayName "$account_name" '{businessId:$businessId,displayName:$displayName}')"
  local status
  status="$(curl -sS --max-time 30 -o /tmp/native-account.json -w '%{http_code}' \
    -X POST "$API/api/capabilities/crm.v1.account.create/invoke" \
    -H "authorization: Bearer $user_token" -H 'content-type: application/json' \
    --data "$(jq -nc --argjson payload "$create_payload" '{payload:$payload}')")"
  [[ "$status" == "200" ]] || fail "native conformance Account prerequisite failed: $status $(cat /tmp/native-account.json)"
  local mapping_id
  mapping_id="$(jq -er '.result.record.mappingId' /tmp/native-account.json)"
  jq -e --arg id "$account_business_id" '.result.record.businessId==$id and .result.record.businessType=="Account"' /tmp/native-account.json >/dev/null || fail "native Account prerequisite identity mismatch"
  native_pass "$provider_label native product proof starts from a canonical mapped Account"

  local file_content="GBAP native file proof $suffix"
  local file_b64
  file_b64="$(printf '%s' "$file_content" | base64 -w0)"
  local file_body
  file_body="$(jq -nc --arg name "energy-bill-$suffix.txt" --arg content "$file_b64" --arg accountId "$account_business_id" --argjson size "${#file_content}" '{fileName:$name,mimeType:"text/plain",sizeBytes:$size,contentBase64:$content,target:{businessType:"Account",businessId:$accountId}}')"
  native_request POST /api/crm-native/files "$file_body" /tmp/native-file-create.json 201 "$user_token"
  local file_id
  file_id="$(jq -er '.file.id' /tmp/native-file-create.json)"
  jq -e --arg accountId "$account_business_id" '.file.fileName|startswith("energy-bill-")' /tmp/native-file-create.json >/dev/null || fail "native file create metadata mismatch"
  jq -e --arg accountId "$account_business_id" '.file.target.businessType=="Account" and .file.target.businessId==$accountId and (.file|has("content")|not) and (.file|has("contentBase64")|not)' /tmp/native-file-create.json >/dev/null || fail "native file response leaked content or lost GBAP target"
  native_pass "$provider_label file upload persists business-safe metadata against GBAP Account identity"

  native_request GET /api/crm-native/files '' /tmp/native-file-list.json 200 "$user_token"
  jq -e --arg id "$file_id" --arg accountId "$account_business_id" '.files | map(select(.id==$id and .target.businessType=="Account" and .target.businessId==$accountId)) | length==1' /tmp/native-file-list.json >/dev/null || fail "native file list missing uploaded file"
  jq -e '.maxFileBytes > 0 and (.files | map(has("content") or has("contentBase64")) | any | not)' /tmp/native-file-list.json >/dev/null || fail "native file list leaked binary content"
  native_pass "$provider_label file list returns durable metadata without inline binary leakage"

  native_request GET "/api/crm-native/files/$file_id/content" '' /tmp/native-file-content.txt 200 "$user_token"
  [[ "$(cat /tmp/native-file-content.txt)" == "$file_content" ]] || fail "native file download content mismatch"
  native_pass "$provider_label authenticated file download returns exact stored bytes"

  native_request DELETE "/api/crm-native/files/$file_id" '' /tmp/native-file-delete.json 200 "$user_token"
  jq -e --arg id "$file_id" '.removed==$id' /tmp/native-file-delete.json >/dev/null || fail "native file delete response mismatch"
  native_request GET /api/crm-native/files '' /tmp/native-file-after-delete.json 200 "$user_token"
  jq -e --arg id "$file_id" '.files | map(select(.id==$id)) | length==0' /tmp/native-file-after-delete.json >/dev/null || fail "native file remained after delete"
  native_pass "$provider_label uploader can delete its file and deletion is durable"

  local view_name="Priority Opportunities $suffix"
  local view_body
  view_body="$(jq -nc --arg name "$view_name" '{name:$name,pageKey:"opportunities",query:{search:"priority"},favorite:true}')"
  native_request POST /api/crm-native/views "$view_body" /tmp/native-view-create.json 201 "$user_token"
  local view_id
  view_id="$(jq -er '.view.id' /tmp/native-view-create.json)"
  jq -e --arg id "$view_id" --arg name "$view_name" '.view.id==$id and .view.name==$name and .view.pageKey=="opportunities" and .view.favorite==true and .view.query.search=="priority"' /tmp/native-view-create.json >/dev/null || fail "native saved-view create mismatch"
  native_request GET /api/crm-native/views '' /tmp/native-view-list.json 200 "$user_token"
  jq -e --arg id "$view_id" '.views | map(select(.id==$id and .favorite==true)) | length==1' /tmp/native-view-list.json >/dev/null || fail "native saved-view list missing created view"
  native_pass "$provider_label saved view persists per-user page/query/favorite state"

  native_request PATCH "/api/crm-native/views/$view_id" '{"favorite":false,"query":{"search":"proposal"}}' /tmp/native-view-update.json 200 "$user_token"
  jq -e --arg id "$view_id" '.view.id==$id and .view.favorite==false and .view.query.search=="proposal"' /tmp/native-view-update.json >/dev/null || fail "native saved-view update mismatch"
  native_pass "$provider_label saved view update persists favorite and query changes"

  native_request DELETE "/api/crm-native/views/$view_id" '' /tmp/native-view-delete.json 200 "$user_token"
  jq -e --arg id "$view_id" '.removed==$id' /tmp/native-view-delete.json >/dev/null || fail "native saved-view delete mismatch"
  native_request GET /api/crm-native/views '' /tmp/native-view-after-delete.json 200 "$user_token"
  jq -e --arg id "$view_id" '.views | map(select(.id==$id)) | length==0' /tmp/native-view-after-delete.json >/dev/null || fail "native saved view remained after delete"

  curl -fsS "$API/api/audit" -H "authorization: Bearer $admin_token" > /tmp/native-audit.json
  for action in crm.file.create crm.file.download crm.file.soft_delete crm.saved_view.create crm.saved_view.update crm.saved_view.delete; do
    jq -e --arg action "$action" '.events | map(select(.action==$action)) | length>=1' /tmp/native-audit.json >/dev/null || fail "native audit event missing: $action"
  done

  native_request DELETE "/api/mappings/$mapping_id" '' /tmp/native-mapping-delete.json 200 "$admin_token"
  native_pass "$provider_label file/view operations are audited and prerequisite mapping cleanup is governed"

  [[ "$pass_count" == "8" ]] || fail "native product conformance expected 8 assertions, got $pass_count"
  printf 'PASS — CRM native product conformance: provider=%s assertions=%d\n' "$provider_label" "$pass_count"
}
