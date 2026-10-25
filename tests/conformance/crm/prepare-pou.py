#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one {label} anchor, found {count}")
    return text.replace(old, new, 1)


def patch_twenty(text: str) -> str:
    text = replace_once(
        text,
        'PROVIDER_JSON="$(jq -nc --arg version "$PROVIDER_VERSION" \'{',
        'PROVIDER_JSON="$(jq -nc --arg version "$PROVIDER_VERSION" --arg adapterRevision "${GITHUB_SHA:-local}" --arg upstreamProduct "Twenty" --arg upstreamVersion "v2.37.0" --arg upstreamImageDigest "$TWENTY_IMAGE_ID" \'{',
        'Twenty jq args',
    )
    text = replace_once(
        text,
        '  replacementEvidence:"E0",\n  secretRef:"pou://twenty-api-key",',
        '  replacementEvidence:"E0",\n  provenance:{contractVersion:"gbap.crm.v1",upstreamProduct:$upstreamProduct,upstreamVersion:$upstreamVersion,upstreamImageDigest:$upstreamImageDigest,adapterRevision:$adapterRevision,configRevision:"tests/pou/twenty/docker-compose.yml",schemaRevision:"twenty-custom-object-pou"},\n  secretRef:"pou://twenty-api-key",',
        'Twenty provenance',
    )
    text = replace_once(
        text,
        '  capabilities:[\n    {name:"crm.company.create",priority:100},',
        '  capabilities:[\n'
        '    {name:"crm.v1.account.create",priority:120},\n'
        '    {name:"crm.v1.account.list",priority:120},\n'
        '    {name:"crm.v1.contact.create",priority:120},\n'
        '    {name:"crm.v1.contact.list",priority:120},\n'
        '    {name:"crm.v1.opportunity.create",priority:120},\n'
        '    {name:"crm.v1.opportunity.list",priority:120},\n'
        '    {name:"crm.v1.snapshot.export",priority:120},\n'
        '    {name:"crm.meta.v1.schema",priority:120},\n'
        '    {name:"crm.meta.v1.views",priority:120},\n'
        '    {name:"crm.meta.v1.layouts",priority:120},\n'
        '    {name:"crm.meta.v1.view.create",priority:120},\n'
        '    {name:"crm.meta.v1.view.update",priority:120},\n'
        '    {name:"crm.meta.v1.view.delete",priority:120},\n'
        '    {name:"crm.meta.v1.record.list",priority:120},\n'
        '    {name:"crm.meta.v1.record.get",priority:120},\n'
        '    {name:"crm.meta.v1.record.create",priority:120},\n'
        '    {name:"crm.meta.v1.record.update",priority:120},\n'
        '    {name:"crm.meta.v1.record.delete",priority:120},\n'
        '    {name:"crm.meta.v1.record.restore",priority:120},\n'
        '    {name:"crm.meta.v1.record.destroy",priority:120},\n'
        '    {name:"crm.meta.v1.record.merge",priority:120},\n'
        '    {name:"crm.meta.v1.record.communication",priority:120},\n'
        '    {name:"crm.meta.v1.permission.check",priority:120},\n'
        '    {name:"crm.ops.v1.account.update",priority:120},\n'
        '    {name:"crm.ops.v1.account.delete",priority:120},\n'
        '    {name:"crm.ops.v1.task.create",priority:120},\n'
        '    {name:"crm.ops.v1.task.list",priority:120},\n'
        '    {name:"crm.ops.v1.task.update",priority:120},\n'
        '    {name:"crm.ops.v1.task.delete",priority:120},\n'
        '    {name:"crm.ops.v1.note.create",priority:120},\n'
        '    {name:"crm.ops.v1.note.list",priority:120},\n'
        '    {name:"crm.ops.v1.note.update",priority:120},\n'
        '    {name:"crm.ops.v1.note.delete",priority:120},\n'
        '    {name:"crm.ops.v1.activity.list",priority:120},\n'
        '    {name:"crm.ops.v1.contact.update",priority:120},\n'
        '    {name:"crm.ops.v1.contact.delete",priority:120},\n'
        '    {name:"crm.ops.v1.opportunity.update",priority:120},\n'
        '    {name:"crm.ops.v1.opportunity.delete",priority:120},\n'
        '    {name:"crm.ops.v1.email.status",priority:120},\n'
        '    {name:"crm.ops.v1.email.list",priority:120},\n'
        '    {name:"crm.ops.v1.calendar.status",priority:120},\n'
        '    {name:"crm.ops.v1.calendar.list",priority:120},\n'
        '    {name:"crm.company.create",priority:100},',
        'Twenty capabilities',
    )
    text = replace_once(
        text,
        "ROLES_QUERY='query GetApiKeyRoles{getApiKeyRoles{id label icon canBeAssignedToApiKeys}}'",
        "ROLES_QUERY='query GetApiKeyRoles{getApiKeyRoles{id label icon isEditable canBeAssignedToApiKeys canUpdateAllSettings canAccessAllTools canReadAllObjectRecords canUpdateAllObjectRecords canSoftDeleteAllObjectRecords canDestroyAllObjectRecords permissionFlags{flag}}}'",
        'Twenty API-key role permission query',
    )
    text = replace_once(
        text,
        'pass "Twenty API-key assignable role discovered"\n\nEXPIRES_AT="$(date -u -d \'+1 day\' \'+%Y-%m-%dT%H:%M:%S.000Z\')"',
        '''pass "Twenty API-key assignable role discovered"

log "create an editable dedicated Twenty service role from the existing API-key role authority"
TEMPLATE_ROLE_ID="$ROLE_ID"
TEMPLATE_ROLE="$(jq -cer --arg roleId "$TEMPLATE_ROLE_ID" '.data.getApiKeyRoles[] | select(.id==$roleId)' /tmp/twenty-roles.json)"
CURRENT_ROLE_FLAGS="$(jq -c --arg roleId "$TEMPLATE_ROLE_ID" '[.data.getApiKeyRoles[] | select(.id==$roleId) | .permissionFlags[]?.flag] | unique' /tmp/twenty-roles.json)"
# Twenty v2.37.0 classifies VIEWS as a tool permission. Its permission service
# therefore uses canAccessAllTools as the base authority for VIEWS, not
# canUpdateAllSettings. This disposable PoU role enables the correct tool base so
# the real API-key View path is exercised deterministically; Production remains
# governed by an explicit least-privilege VIEWS flag and must not use all-tools as
# a substitute for provider-side least privilege.
CREATE_ADAPTER_ROLE_QUERY='mutation CreateOneRole($input:CreateRoleInput!){createOneRole(createRoleInput:$input){id label isEditable canBeAssignedToApiKeys canUpdateAllSettings canAccessAllTools}}'
CREATE_ADAPTER_ROLE_VARS="$(jq -nc --argjson template "$TEMPLATE_ROLE" '{input:{label:"GBAP PoU Adapter",description:"Dedicated editable service role for the GBAP Twenty adapter proof",canUpdateAllSettings:($template.canUpdateAllSettings // false),canAccessAllTools:true,canReadAllObjectRecords:($template.canReadAllObjectRecords // false),canUpdateAllObjectRecords:($template.canUpdateAllObjectRecords // false),canSoftDeleteAllObjectRecords:($template.canSoftDeleteAllObjectRecords // false),canDestroyAllObjectRecords:($template.canDestroyAllObjectRecords // false),canBeAssignedToUsers:false,canBeAssignedToAgents:false,canBeAssignedToApiKeys:true}}')"
graphql /tmp/twenty-create-adapter-role.json "$TWENTY_USER_TOKEN" "$CREATE_ADAPTER_ROLE_QUERY" "$CREATE_ADAPTER_ROLE_VARS"
ROLE_ID="$(jq -er '.data.createOneRole.id' /tmp/twenty-create-adapter-role.json)"
jq -e '.data.createOneRole.isEditable==true and .data.createOneRole.canBeAssignedToApiKeys==true and .data.createOneRole.canAccessAllTools==true' /tmp/twenty-create-adapter-role.json >/dev/null || fail "Twenty dedicated adapter role lacks required proof tool authority"
pass "Twenty dedicated editable API-key role created with proof tool authority"

log "grant the existing service-role flags plus the additional workspace View flag required by the governed adapter"
ROLE_FLAGS_WITH_VIEWS="$(jq -nc --argjson current "$CURRENT_ROLE_FLAGS" '$current + ["VIEWS"] | unique')"
UPSERT_FLAGS_QUERY='mutation UpsertPermissionFlags($input:UpsertPermissionFlagsInput!){upsertPermissionFlags(upsertPermissionFlagsInput:$input){id roleId flag}}'
graphql /tmp/twenty-role-view-permission.json "$TWENTY_USER_TOKEN" "$UPSERT_FLAGS_QUERY" "$(jq -nc --arg roleId "$ROLE_ID" --argjson flags "$ROLE_FLAGS_WITH_VIEWS" '{input:{roleId:$roleId,permissionFlagKeys:$flags}}')"
jq -e --arg roleId "$ROLE_ID" '.data.upsertPermissionFlags | map(select(.roleId==$roleId) | .flag) | index("VIEWS") != null' /tmp/twenty-role-view-permission.json >/dev/null || fail "Twenty adapter API-key role did not retain VIEWS permission"
pass "Twenty adapter API-key role has governed workspace View permission"

EXPIRES_AT="$(date -u -d '+1 day' '+%Y-%m-%dT%H:%M:%S.000Z')"''',
        'Twenty adapter View permission bootstrap',
    )
    text = replace_once(
        text,
        "CREATE_KEY_QUERY='mutation CreateApiKey($input:CreateApiKeyInput!){createApiKey(input:$input){id name expiresAt}}'\ngraphql /tmp/twenty-create-key.json \"$TWENTY_USER_TOKEN\" \"$CREATE_KEY_QUERY\" \"$(jq -nc --arg roleId \"$ROLE_ID\" --arg expiresAt \"$EXPIRES_AT\" '{input:{name:\"GBAP PoU Adapter\",expiresAt:$expiresAt,roleId:$roleId}}')\"\nAPI_KEY_ID=\"$(jq -er '.data.createApiKey.id' /tmp/twenty-create-key.json)\"",
        '''CREATE_KEY_QUERY='mutation CreateApiKey($input:CreateApiKeyInput!){createApiKey(input:$input){id name expiresAt}}'
graphql /tmp/twenty-create-key.json "$TWENTY_USER_TOKEN" "$CREATE_KEY_QUERY" "$(jq -nc --arg roleId "$ROLE_ID" --arg expiresAt "$EXPIRES_AT" '{input:{name:"GBAP PoU Adapter",expiresAt:$expiresAt,roleId:$roleId}}')"
API_KEY_ID="$(jq -er '.data.createApiKey.id' /tmp/twenty-create-key.json)"

log "explicitly assign the governed role to the API key before checking effective authority"
ASSIGN_KEY_ROLE_QUERY='mutation AssignRoleToApiKey($apiKeyId:UUID!,$roleId:UUID!){assignRoleToApiKey(apiKeyId:$apiKeyId,roleId:$roleId)}'
graphql /tmp/twenty-assign-key-role.json "$TWENTY_USER_TOKEN" "$ASSIGN_KEY_ROLE_QUERY" "$(jq -nc --arg apiKeyId "$API_KEY_ID" --arg roleId "$ROLE_ID" '{apiKeyId:$apiKeyId,roleId:$roleId}')"
jq -e '.data.assignRoleToApiKey==true' /tmp/twenty-assign-key-role.json >/dev/null || fail "Twenty API key role assignment failed"
pass "Twenty API key role target assigned explicitly"

log "read back the API key after assignment and prove its effective governed role"
# Twenty v2.37.0's nested apiKey.role resolver can return permissionFlags=null even
# when the role-level permission mutation has already materialized VIEWS. Prove the
# explicit flag at role scope above, then prove here that this API key resolves to
# the exact dedicated role and retains the tool authority used by the VIEWS guard.
GET_KEY_QUERY='query GetApiKey($input:GetApiKeyInput!){apiKey(input:$input){id role{id label canAccessAllTools}}}'
ROLE_READBACK_OK=false
for attempt in $(seq 1 15); do
  graphql /tmp/twenty-get-key.json "$TWENTY_USER_TOKEN" "$GET_KEY_QUERY" "$(jq -nc --arg apiKeyId "$API_KEY_ID" '{input:{id:$apiKeyId}}')"
  if jq -e --arg apiKeyId "$API_KEY_ID" --arg roleId "$ROLE_ID" '.data.apiKey.id==$apiKeyId and .data.apiKey.role.id==$roleId and .data.apiKey.role.canAccessAllTools==true' /tmp/twenty-get-key.json >/dev/null; then
    ROLE_READBACK_OK=true
    break
  fi
  sleep 1
done
if [[ "$ROLE_READBACK_OK" != "true" ]]; then
  cat /tmp/twenty-get-key.json >&2 || true
  fail "Twenty API key effective governed role read-back failed after bounded cache propagation wait"
fi
pass "Twenty API key is bound to the VIEWS-governed role with tool authority"''',
        'Twenty API-key effective-role proof',
    )
    text = replace_once(
        text,
        'log "start protocol adapter and register Twenty as a GBAP provider"\n"${TWENTY_COMPOSE[@]}" up -d --build twenty-adapter\nPROVIDER_VERSION="image:${TWENTY_IMAGE_ID#sha256:}"',
        'log "start protocol adapter and register Twenty as a GBAP provider"\n"${TWENTY_COMPOSE[@]}" up -d --build twenty-adapter\n\nlog "refresh GBAP tokens after long Twenty bootstrap"\nADMIN_TOKEN="$(get_gbap_token substrate-admin substrate-admin)"\nUSER_TOKEN="$(get_gbap_token substrate-user substrate-user)"\n[[ -n "$ADMIN_TOKEN" && -n "$USER_TOKEN" ]] || fail "GBAP tokens not reissued after Twenty bootstrap"\npass "GBAP admin/user authentication refreshed"\nPROVIDER_VERSION="image:${TWENTY_IMAGE_ID#sha256:}"',
        'Twenty GBAP token refresh',
    )
    text = replace_once(
        text,
        'pass "Twenty provider registered without persisting raw API key"\nwait_provider_health HEALTHY "$USER_TOKEN"\n\nlog "real CRM CRUD through GBAP capability boundary"',
        'pass "Twenty provider registered without persisting raw API key"\n'
        'wait_provider_health HEALTHY "$USER_TOKEN"\n'
        'MANAGER_TOKEN="$(get_gbap_token substrate-manager substrate-manager)"\n'
        '[[ -n "$MANAGER_TOKEN" ]] || fail "GBAP manager token not issued"\n'
        'source "$ROOT/tests/conformance/crm/manager-rbac-conformance.sh"\n'
        'crm_manager_rbac_conformance "$ADMIN_TOKEN" "$USER_TOKEN" "$MANAGER_TOKEN" "Twenty"\n'
        'source "$ROOT/tests/conformance/crm/canonical-conformance.sh"\n'
        'canonical_crm_conformance "twenty-crm-pou" "$ADMIN_TOKEN" "$USER_TOKEN" "Twenty"\n'
        'source "$ROOT/tests/conformance/crm/operational-conformance.sh"\n'
        'crm_operational_conformance "twenty-crm-pou" "$ADMIN_TOKEN" "$USER_TOKEN" "Twenty"\n'
        'source "$ROOT/tests/conformance/crm/record-lifecycle-conformance.sh"\n'
        'crm_record_lifecycle_conformance "twenty-crm-pou" "$ADMIN_TOKEN" "$USER_TOKEN" "Twenty"\n'
        'source "$ROOT/tests/conformance/crm/runtime-capability-conformance.sh"\n'
        'crm_runtime_capability_conformance "$ADMIN_TOKEN" "$USER_TOKEN" "Twenty"\n'
        'source "$ROOT/tests/conformance/crm/runtime-advanced-conformance.sh"\n'
        'crm_runtime_advanced_conformance "$ADMIN_TOKEN" "$USER_TOKEN" "$MANAGER_TOKEN" "Twenty"\n'
        'source "$ROOT/tests/conformance/crm/communication-conformance.sh"\n'
        'crm_communication_conformance "$USER_TOKEN" "Twenty"\n'
        'source "$ROOT/tests/conformance/crm/native-product-conformance.sh"\n'
        'crm_native_product_conformance "$ADMIN_TOKEN" "$USER_TOKEN" "Twenty"\n'
        '\nlog "real CRM CRUD through GBAP capability boundary"',
        'Twenty CRM conformance insertion',
    )
    return text


def patch_frappe(text: str) -> str:
    text = replace_once(
        text,
        'PROVIDER_JSON="$(jq -nc --arg version "$PROVIDER_VERSION" \'{',
        'PROVIDER_JSON="$(jq -nc --arg version "$PROVIDER_VERSION" --arg adapterRevision "${GITHUB_SHA:-local}" --arg upstreamProduct "Frappe CRM" --arg upstreamVersion "v1.82.0" --arg upstreamCommit "48cb3cccec12ef798f8faacc165fff3dc008a8fa" --arg upstreamImageDigest "$FRAPPE_IMAGE_ID" \'{',
        'Frappe jq args',
    )
    text = replace_once(
        text,
        '  replacementEvidence:"E0",\n  secretRef:"pou://frappe-api-token",',
        '  replacementEvidence:"E0",\n  provenance:{contractVersion:"gbap.crm.v1",upstreamProduct:$upstreamProduct,upstreamVersion:$upstreamVersion,upstreamCommit:$upstreamCommit,upstreamImageDigest:$upstreamImageDigest,adapterRevision:$adapterRevision,configRevision:"tests/pou/frappe/docker-compose.yml",schemaRevision:"gbap_project_code+gbap_opportunity_name_summary"},\n  secretRef:"pou://frappe-api-token",',
        'Frappe provenance',
    )
    text = replace_once(
        text,
        '  capabilities:[\n    {name:"crm.organization.create",priority:100},',
        '  capabilities:[\n    {name:"crm.v1.account.create",priority:120},\n    {name:"crm.v1.account.list",priority:120},\n    {name:"crm.v1.contact.create",priority:120},\n    {name:"crm.v1.contact.list",priority:120},\n    {name:"crm.v1.opportunity.create",priority:120},\n    {name:"crm.v1.opportunity.list",priority:120},\n    {name:"crm.v1.snapshot.export",priority:120},\n    {name:"crm.organization.create",priority:100},',
        'Frappe capabilities',
    )
    text = replace_once(
        text,
        'pass "Frappe API v2 metadata reflects GBAP custom field"\n\nlog "refresh GBAP tokens after long Frappe bootstrap"',
        '''pass "Frappe API v2 metadata reflects GBAP custom field"

log "materialize GBAP canonical Opportunity name_summary field without changing historical project-code semantics"
CANONICAL_NAME_FIELD_JSON='{"dt":"CRM Deal","label":"GBAP Opportunity Name Summary","fieldname":"gbap_opportunity_name_summary","fieldtype":"Data","insert_after":"gbap_project_code"}'
STATUS="$(frappe_token_request /tmp/frappe-canonical-name-field.json "$FRAPPE_SERVICE_TOKEN" -X POST "$FRAPPE/api/resource/Custom%20Field" -H 'content-type: application/json' --data "$CANONICAL_NAME_FIELD_JSON")"
[[ "$STATUS" =~ ^20[01]$ ]] || fail "canonical Opportunity name_summary field creation failed: $STATUS $(cat /tmp/frappe-canonical-name-field.json)"

log "refresh GBAP tokens after long Frappe bootstrap"''',
        'Frappe canonical opportunity field',
    )
    text = replace_once(
        text,
        'pass "Frappe provider registered without raw API secret"\nwait_provider_health HEALTHY "$USER_TOKEN"\npass "Frappe provider health=HEALTHY"\n\nlog "real daily-sales CRM flow through GBAP"',
        'pass "Frappe provider registered without raw API secret"\nwait_provider_health HEALTHY "$USER_TOKEN"\npass "Frappe provider health=HEALTHY"\nsource "$ROOT/tests/conformance/crm/canonical-conformance.sh"\ncanonical_crm_conformance "frappe-crm-pou" "$ADMIN_TOKEN" "$USER_TOKEN" "Frappe"\n\nlog "real daily-sales CRM flow through GBAP"',
        'Frappe conformance insertion',
    )
    return text


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--provider', choices=['twenty', 'frappe'], required=True)
    parser.add_argument('--path', required=True)
    args = parser.parse_args()
    path = Path(args.path)
    text = path.read_text()
    patched = patch_twenty(text) if args.provider == 'twenty' else patch_frappe(text)
    path.write_text(patched)
    print(f"prepared {args.provider} PoU runner with CRM conformance")


if __name__ == '__main__':
    main()