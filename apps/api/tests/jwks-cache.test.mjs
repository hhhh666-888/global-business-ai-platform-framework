import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJwksCache } from '../jwks-cache.mjs';

test('concurrent key requests share one fetch; unknown kids do not evict a valid signing key', async () => {
  let requests = 0;
  const get = createJwksCache({ fetchImpl: async () => { requests++; return Response.json({ keys: [{ kid: 'trusted', kty: 'RSA' }] }); } });
  const results = await Promise.all(new Array(20).fill(null).map(() => get('trusted', 'https://identity.example/keys')));
  assert.equal(results.length, 20); assert.equal(requests, 1);
  for (let i = 0; i < 50; i++) await assert.rejects(get(`attacker-${i}`, 'https://identity.example/keys'), /unknown_signing_key/);
  assert.equal((await get('trusted', 'https://identity.example/keys')).kid, 'trusted');
  assert.equal(requests, 1, 'unknown keys must not force downstream identity requests');
});

test('rotation refreshes after bounded cooldown and outages preserve unexpired trusted keys', async () => {
  let time = 1; let requests = 0; let outage = false;
  const get = createJwksCache({ now: () => time, fetchImpl: async () => {
    requests++; if (outage) throw new Error('private connection detail');
    return Response.json({ keys: [{ kid: requests === 1 ? 'first' : 'rotated', kty: 'RSA' }] });
  } });
  await get('first', 'https://identity.example/keys');
  time += 5001; await get('rotated', 'https://identity.example/keys'); assert.equal(requests, 2);
  time += 5001; outage = true;
  await assert.rejects(get('unknown', 'https://identity.example/keys'), /jwks_unavailable/);
  assert.equal((await get('rotated', 'https://identity.example/keys')).kid, 'rotated'); assert.equal(requests, 3);
  time += 60_001;
  await assert.rejects(get('rotated', 'https://identity.example/keys'), /jwks_unavailable/);
});

test('oversized, ambiguous and malformed signing-key responses fail closed', async () => {
  for (const response of [Response.json({ keys: [{ kid: 'duplicate' }, { kid: 'duplicate' }] }), new Response('x'.repeat(256 * 1024 + 1)), new Response('not JSON')]) {
    const get = createJwksCache({ fetchImpl: async () => response });
    await assert.rejects(get('trusted', 'https://identity.example/keys'), error => error.httpStatus === 503 && !error.message.includes('not JSON'));
  }
  let called = false;
  const get = createJwksCache({ fetchImpl: async () => { called = true; return Response.json({ keys: [] }); } });
  await assert.rejects(get('x'.repeat(257), 'https://identity.example/keys'), /unsupported_signing_key/);
  assert.equal(called, false);
});

test('signing keys must match the supported RSA signature algorithm and key use', async () => {
  for (const key of [{ kid: 'wrong', kty: 'EC' }, { kid: 'wrong', kty: 'RSA', use: 'enc' }, { kid: 'wrong', kty: 'RSA', alg: 'RS512' }]) {
    const get = createJwksCache({ fetchImpl: async () => Response.json({ keys: [key] }) });
    await assert.rejects(get('wrong', 'https://identity.example/keys'), /unsupported_signing_key/);
  }
});
