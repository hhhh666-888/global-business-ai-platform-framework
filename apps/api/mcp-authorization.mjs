function publicUrl(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`invalid_${label}`); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) throw new Error(`invalid_${label}`);
  return url;
}

/** RFC 9728 metadata is opt-in until the public address and audience mapper exist. */
export function mcpAuthorizationProfile({ publicResourceUrl = process.env.GBAP_MCP_PUBLIC_RESOURCE_URL, authorizationServerUrl = process.env.GBAP_MCP_AUTHORIZATION_SERVER_URL } = {}) {
  if (!String(publicResourceUrl ?? '').trim() && !String(authorizationServerUrl ?? '').trim()) return null;
  const resource = publicUrl(String(publicResourceUrl ?? '').trim(), 'mcp_resource_url');
  const issuer = publicUrl(String(authorizationServerUrl ?? '').trim(), 'mcp_authorization_server_url');
  resource.pathname = resource.pathname.replace(/\/$/, '');
  if (!['/api/mcp', '/mcp'].includes(resource.pathname)) throw new Error('invalid_mcp_resource_path');
  const metadataPath = `/.well-known/oauth-protected-resource${resource.pathname}`;
  return {
    resource: resource.href,
    metadataPath,
    metadataUrl: new URL(metadataPath, resource.origin).href,
    metadata: { resource: resource.href, authorization_servers: [issuer.href], bearer_methods_supported: ['header'], resource_name: 'GBAP CRM and Enterprise Knowledge' },
  };
}
