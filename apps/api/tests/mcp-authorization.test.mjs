import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mcpAuthorizationProfile } from '../mcp-authorization.mjs';

test('MCP discovery uses explicitly configured public URLs, never the request Host', () => {
  const profile = mcpAuthorizationProfile({ publicResourceUrl: 'https://portal.example/api/mcp/', authorizationServerUrl: 'https://identity.example/realms/gbap' });
  assert.equal(profile.metadataUrl, 'https://portal.example/.well-known/oauth-protected-resource/api/mcp');
  assert.equal(profile.resource, 'https://portal.example/api/mcp');
  assert.deepEqual(profile.metadata.authorization_servers, ['https://identity.example/realms/gbap']);
  assert.equal(JSON.stringify(profile).includes('secret'), false);
});

test('MCP discovery rejects unsafe, incomplete and insecure remote configuration', () => {
  for (const url of ['http://remote.example/api/mcp', 'javascript:alert(1)', 'https://user:secret@portal.example/api/mcp', 'https://portal.example/api/mcp?secret=x', 'https://portal.example/api/mcp#x', 'https://portal.example/another-api']) {
    assert.throws(() => mcpAuthorizationProfile({ publicResourceUrl: url, authorizationServerUrl: 'https://identity.example/realms/gbap' }), /invalid_mcp/);
  }
  assert.throws(() => mcpAuthorizationProfile({ publicResourceUrl: 'https://portal.example/api/mcp', authorizationServerUrl: '' }), /invalid_mcp/);
  assert.throws(() => mcpAuthorizationProfile({ publicResourceUrl: 'https://portal.example/api/mcp', authorizationServerUrl: 'http://identity.example/realms/gbap' }), /invalid_mcp/);
});

test('MCP keeps the existing Bearer profile when discovery is unset and permits local development', () => {
  assert.equal(mcpAuthorizationProfile({ publicResourceUrl: '', authorizationServerUrl: '' }), null);
  assert.equal(mcpAuthorizationProfile({ publicResourceUrl: 'http://localhost:8080/api/mcp', authorizationServerUrl: 'http://localhost:8080/realms/gbap' }).metadata.resource, 'http://localhost:8080/api/mcp');
});
