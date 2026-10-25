#!/usr/bin/env bash

crm_runtime_capability_conformance() {
  local admin_token="$1"
  local user_token="$2"
  local provider_label="$3"
  local suffix="${GITHUB_RUN_ID:-local}-${RANDOM}"
  local pass_count=0

  runtime_pass() {
    pass_count=$((pass_count + 1))
    printf '[crm-runtime][PASS %02d] %s\n' "$pass_count" "$*"
  }
  runtime_get() {
    local path="$1" output="$2" token="${3:-$user_token}" status
    status="$(curl -sS --max-time 60 -o "$output" -w '%{http_code}' "$API$path" -H "authorization: Bearer $token")"
    [[ "$status" == "200" ]] || fail "CRM runtime GET $path expected 200, got $status: $(cat "$output")"
  }
  runtime_json() {
    local method="$1" path="$2" body="$3" output="$4" expected="${5:-200}" token="${6:-$user_token}" status
    status="$(curl -sS --max-time 60 -o "$output" -w '%{http_code}' -X "$method" "$API$path" \
      -H "authorization: Bearer $token" -H 'content-type: application/json' --data "$body")"
    [[ "$status" == "$expected" ]] || fail "CRM runtime $method $path expected $expected, got $status: $(cat "$output")"
  }

  runtime_get '/api/crm-runtime/schema?refresh=1' /tmp/runtime-schema.json
  jq -e '
    .providerNeutral==true and
    ([.objects[].objectKey] | index("company")) != null and
    ([.objects[].objectKey] | index("person")) != null and
    ([.objects[].objectKey] | index("opportunity")) != null and
    ([.objects[].objectKey] | index("gbapProject")) != null and
    ([.objects[] | select(.objectKey=="company") | .fields[].fieldKey] | index("address")) != null and
    ([.objects[] | select(.objectKey=="person") | .fields[].fieldKey] | index("emails")) != null and
    ([.objects[] | select(.objectKey=="person") | .fields[].fieldKey] | index("phones")) != null and
    ([.. | objects | keys[]] | any(. == "externalId" or . == "objectMetadataId" or . == "fieldMetadataId") | not)
  ' /tmp/runtime-schema.json >/dev/null || fail "runtime schema did not expose standard/custom metadata without provider IDs"
  runtime_pass "$provider_label standard + custom objects and rich fields exposed through provider-neutral metadata"

  runtime_get '/api/crm-runtime/views' /tmp/runtime-views.json
  jq -e '
    (.views | type)=="array" and (.views|length)>0 and
    ([.views[].type] | any(.=="TABLE" or .=="KANBAN" or .=="CALENDAR")) and
    ([.views[] | select(.objectKey=="company" or .objectKey=="opportunity")] | length)>0
  ' /tmp/runtime-views.json >/dev/null || fail "runtime provider views missing"
  runtime_pass "$provider_label native view metadata available to GBAP runtime"

  runtime_json POST '/api/capabilities/crm.meta.v1.views/invoke' '{}' /tmp/runtime-raw-metadata-denied.json 403 "$user_token"
  jq -e '.error=="internal_provider_capability_forbidden"' /tmp/runtime-raw-metadata-denied.json >/dev/null || fail "raw provider metadata capability bypass was not denied"
  runtime_pass "$provider_label raw crm.meta.v1 provider capability cannot bypass the GBAP runtime boundary"

  runtime_get '/api/crm-runtime/layouts' /tmp/runtime-layouts.json
  jq -e '(.layouts|type)=="array"' /tmp/runtime-layouts.json >/dev/null || fail "runtime layout endpoint invalid"
  runtime_pass "$provider_label record-page layout metadata endpoint usable"

  local company_name="Runtime Company $suffix"
  runtime_json POST '/api/crm-runtime/objects/company/records' \
    "$(jq -nc --arg name "$company_name" '{fields:{name:$name,domainName:{primaryLinkUrl:"https://runtime.example.com",primaryLinkLabel:"",secondaryLinks:[]},address:{addressStreet1:"Av. Runtime",addressStreet2:"",addressCity:"Quito",addressPostcode:"170101",addressState:"Pichincha",addressCountry:"Ecuador"}}}')" \
    /tmp/runtime-company-create.json 201
  local company_business_id
  company_business_id="$(jq -er '.record.businessId' /tmp/runtime-company-create.json)"
  jq -e --arg name "$company_name" '.record.objectKey=="company" and .record.values.name==$name and (.record|has("id")|not)' /tmp/runtime-company-create.json >/dev/null || fail "runtime company create leaked provider identity or lost values"
  runtime_pass "$provider_label dynamic Company create returns only GBAP business identity"

  local person_name="Runtime Buyer $suffix"
  runtime_json POST '/api/crm-runtime/objects/person/records' \
    "$(jq -nc --arg firstName 'Runtime' --arg lastName "Buyer $suffix" --arg companyBusinessId "$company_business_id" '{fields:{name:{firstName:$firstName,lastName:$lastName},emails:{primaryEmail:"runtime.buyer@example.com",additionalEmails:[]},phones:{primaryPhoneNumber:"+593999111222",primaryPhoneCountryCode:"",primaryPhoneCallingCode:"",additionalPhones:[]},jobTitle:"Procurement Director",company:{businessId:$companyBusinessId,objectKey:"company"}}}')" \
    /tmp/runtime-person-create.json 201
  local person_business_id
  person_business_id="$(jq -er '.record.businessId' /tmp/runtime-person-create.json)"
  jq -e --arg companyBusinessId "$company_business_id" '.record.values.company.businessId==$companyBusinessId and .record.values.emails.primaryEmail=="runtime.buyer@example.com"' /tmp/runtime-person-create.json >/dev/null || fail "runtime relation/composite field create mismatch"
  runtime_pass "$provider_label composite fields + Company relation translated through businessId"

  runtime_json PATCH "/api/crm-runtime/objects/person/records/$person_business_id" \
    '{"fields":{"jobTitle":"Global Procurement Director"}}' /tmp/runtime-person-update.json
  jq -e '.record.values.jobTitle=="Global Procurement Director"' /tmp/runtime-person-update.json >/dev/null || fail "runtime dynamic update mismatch"
  runtime_pass "$provider_label metadata-driven record update works without handwritten Person API"

  runtime_json POST '/api/crm-runtime/objects/gbapProject/records' \
    "$(jq -nc --arg name "Runtime Project $suffix" '{fields:{name:$name}}')" /tmp/runtime-custom-create.json 201
  local custom_business_id
  custom_business_id="$(jq -er '.record.businessId' /tmp/runtime-custom-create.json)"
  runtime_get '/api/crm-runtime/objects/gbapProject/records?limit=500' /tmp/runtime-custom-list.json
  jq -e --arg id "$custom_business_id" '[.records[]|select(.businessId==$id)]|length==1' /tmp/runtime-custom-list.json >/dev/null || fail "runtime custom object record not listed"
  runtime_pass "$provider_label custom object usable without a new GBAP handwritten Surface"

  runtime_json DELETE "/api/crm-runtime/objects/gbapProject/records/$custom_business_id" '{}' /tmp/runtime-custom-delete.json
  jq -e --arg id "$custom_business_id" '.deleted==true and .recoverable==true and .businessId==$id' /tmp/runtime-custom-delete.json >/dev/null || fail "runtime soft delete response mismatch"
  runtime_pass "$provider_label normal delete is recoverable soft delete"

  runtime_get '/api/crm-runtime/objects/gbapProject/records?limit=500&deleted=1' /tmp/runtime-custom-deleted.json
  jq -e --arg id "$custom_business_id" '[.records[]|select(.businessId==$id)]|length==1' /tmp/runtime-custom-deleted.json >/dev/null || fail "runtime deleted record missing from recycle bin"
  runtime_pass "$provider_label recycle-bin listing preserves durable business identity"

  runtime_json POST "/api/crm-runtime/objects/gbapProject/records/$custom_business_id/restore" '{}' /tmp/runtime-custom-restore.json
  jq -e --arg id "$custom_business_id" '.record.businessId==$id and .record.deleted==false' /tmp/runtime-custom-restore.json >/dev/null || fail "runtime restore mismatch"
  runtime_pass "$provider_label soft-deleted custom record restored"

  runtime_json DELETE "/api/crm-runtime/objects/gbapProject/records/$custom_business_id" '{}' /tmp/runtime-custom-delete-again.json
  runtime_json POST "/api/crm-runtime/objects/gbapProject/records/$custom_business_id/destroy" '{}' /tmp/runtime-destroy-user.json 403 "$user_token"
  runtime_pass "$provider_label permanent destroy denied to normal user"

  runtime_json POST "/api/crm-runtime/objects/gbapProject/records/$custom_business_id/destroy" '{}' /tmp/runtime-destroy-admin.json 200 "$admin_token"
  jq -e --arg id "$custom_business_id" '.destroyed==true and .businessId==$id' /tmp/runtime-destroy-admin.json >/dev/null || fail "runtime admin destroy mismatch"
  runtime_pass "$provider_label permanent destroy restricted to GBAP super-admin"

  runtime_get '/api/mappings' /tmp/runtime-mappings.json "$admin_token"
  jq -e --arg id "$custom_business_id" '[.mappings[]|select(.business_id==$id)]|length==0' /tmp/runtime-mappings.json >/dev/null || fail "destroyed dynamic mapping still exists"
  runtime_pass "$provider_label permanent destroy removes provider mapping after upstream success"

  # Cleanup the runtime-created person/company with the runtime soft-delete path.
  runtime_json DELETE "/api/crm-runtime/objects/person/records/$person_business_id" '{}' /tmp/runtime-person-delete.json
  runtime_json DELETE "/api/crm-runtime/objects/company/records/$company_business_id" '{}' /tmp/runtime-company-delete.json
  runtime_pass "$provider_label runtime-created standard records cleaned through provider lifecycle"

  [[ "$pass_count" == "15" ]] || fail "CRM runtime conformance expected 15 assertions, got $pass_count"
  printf 'PASS — CRM metadata runtime conformance: provider=%s assertions=%d\n' "$provider_label" "$pass_count"
}
