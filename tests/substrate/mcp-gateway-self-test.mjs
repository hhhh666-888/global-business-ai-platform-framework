import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMcpTool, listMcpTools, MCP_GATEWAY_VERSION } from '../../apps/api/mcp-tool-registry.mjs';

assert.equal(MCP_GATEWAY_VERSION, 'gbap.mcp.v1');

const expected = [
  'crm_company_list',
  'crm_contact_list',
  'crm_opportunity_list',
  'crm_task_list',
  'crm_note_list',
  'crm_activity_list',
  'knowledge_search',
];
const tools = listMcpTools();
assert.deepEqual(tools.map((tool) => tool.name), expected);
for (const tool of tools) {
  assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must stay read-only in MCP v1`);
  assert.equal(tool.annotations?.destructiveHint, false);
  assert.ok(tool.inputSchema && tool.inputSchema.type === 'object');
  assert.ok(getMcpTool(tool.name));
}
assert.equal(getMcpTool('crm_task_create'), null);
assert.equal(getMcpTool('mail_send'), null);

const bootstrap = readFileSync(new URL('../../apps/api/bootstrap.mjs', import.meta.url), 'utf8');
assert.match(bootstrap, /createMcpNativeHandler/);
assert.doesNotMatch(bootstrap, /createAiNativeHandler|createAiTwentyBridgeHandler|generative\.v1/);

const app = readFileSync(new URL('../../apps/web/src/App.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(app, /AiAssistantSurface|AI 助手|GBAP \/ 企业 AI/);
assert.doesNotMatch(app, /EmailSurface|label: '邮件'|key: 'email'/);
assert.match(app, /KnowledgeSurface/);
assert.match(app, /CalendarSurface/);

const start = readFileSync(new URL('../../infrastructure/local-uat/Start-GBAP-UAT.ps1', import.meta.url), 'utf8');
const uat = readFileSync(new URL('../../infrastructure/local-uat/Test-GBAP-UAT.ps1', import.meta.url), 'utf8');
assert.doesNotMatch(start, /TwentyAiBridgeTokenPath|twenty-crm-ai-uat|Sync-GBAP-UAT-TwentyAiProvider/);
assert.match(start, /Retire-GBAP-RetiredProviders\.ps1/);
assert.doesNotMatch(start, /twenty-bridge-secret|twenty-database-url|UAT_TWENTY_ADAPTER_DB_PASSWORD/);

const compose = readFileSync(new URL('../../infrastructure/local-uat/docker-compose.yml', import.meta.url), 'utf8');
assert.doesNotMatch(compose, /GBAP_TWENTY_AI_BRIDGE|twenty-ai-bridge|AI_PROVIDERS|gbap-ai-bridge|TWENTY_AI_REQUEST_TIMEOUT/);
assert.doesNotMatch(compose, /twenty-mail-calendar|MESSAGING_PROVIDER_|CALENDAR_PROVIDER_|AUTH_GOOGLE_|AUTH_MICROSOFT_|twenty-oauth-callback/);

assert.match(uat, /PSObject\.Properties\.Name/u);
assert.match(uat, /'error' -in \$responseProperties/u);
assert.match(uat, /'result' -notin \$responseProperties/u);
assert.doesNotMatch(uat, /if \(\$response\.error\)/u);
assert.doesNotMatch(uat, /\.result\.isError -eq \$true/u);

const apiServer = readFileSync(new URL('../../apps/api/server.mjs', import.meta.url), 'utf8');
assert.match(apiServer, /retired_capability_not_allowed/);
for (const retired of [
  "'crm.ops.v1.email.'",
  "'crm.ops.v1.mail-calendar.'",
  "'crm.ops.v1.calendar.'",
  "'crm.ai.'",
  "'generative.'",
]) assert.ok(apiServer.includes(retired), `API retired capability boundary missing ${retired}`);

const webServer = readFileSync(new URL('../../apps/web/server.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(webServer, /mail-attachment|google-apis|microsoft-apis|oauth-return|integration-foundation\/mail-calendar/);

const providerTemplate = readFileSync(new URL('../../infrastructure/twenty-production/provider-registration.template.json', import.meta.url), 'utf8');
assert.doesNotMatch(providerTemplate, /crm\.ops\.v1\.email|crm\.ops\.v1\.calendar|mail-calendar|crm\.ai|generative/);

const knowledgeStart = readFileSync(new URL('../../infrastructure/knowledge-runtime/Start-GBAP-Knowledge-UAT.ps1', import.meta.url), 'utf8');
assert.doesNotMatch(knowledgeStart, /Sync-GBAP-RagflowEnterpriseLead|Sync-GBAP-AiOrchestrationProvider/);

const mcp = readFileSync(new URL('../../apps/api/mcp-native.mjs', import.meta.url), 'utf8');
assert.match(mcp, /roles\.has\('substrate-manager'\)/u);
for (const required of [
  "'/api/mcp'",
  "'/mcp'",
  "'initialize'",
  "'tools/list'",
  "'tools/call'",
  'Bearer realm="GBAP GBAP MCP"',
  "authorization",
]) assert.ok(mcp.includes(required), `MCP gateway missing ${required}`);

console.log('GBAP_CRM_KNOWLEDGE_MCP_GATEWAY=PASS');
