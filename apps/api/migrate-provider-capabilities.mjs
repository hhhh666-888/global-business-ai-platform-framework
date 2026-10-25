import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolveProviderMigrationProfile, validateProviderMigrationCapabilities } from './provider-migration-profile.mjs';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const providerId = process.argv[2] ?? '';

function fail(message) {
  console.error(JSON.stringify({ event: 'provider.capabilities.migration.failed', providerId, error: message }));
  process.exit(1);
}

if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(providerId)) fail('invalid_provider_id');

let raw = '';
for await (const chunk of process.stdin) raw += chunk.toString('utf8');
if (!raw.trim()) fail('capabilities_json_required');

let input;
try { input = JSON.parse(raw); }
catch { fail('invalid_capabilities_json'); }

if (!Array.isArray(input) || input.length === 0 || input.length > 64) fail('invalid_capabilities');
const seen = new Set();
const desired = input.map((item) => {
  const name = typeof item?.name === 'string' ? item.name.trim() : '';
  if (!name || name.length > 128 || !/^[A-Za-z][A-Za-z0-9_.:-]*$/.test(name)) fail('invalid_capability_name');
  if (seen.has(name)) fail(`duplicate_capability:${name}`);
  seen.add(name);
  const priority = item?.priority === undefined ? 100 : item.priority;
  if (!Number.isInteger(priority) || priority < -100000 || priority > 100000) fail(`invalid_capability_priority:${name}`);
  return { name, priority };
});

desired.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : b.priority - a.priority));
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

try {
  const provider = db.prepare('SELECT * FROM provider_registration WHERE id=?').get(providerId);
  if (!provider) fail('provider_not_found');
  let profile;
  try { profile = resolveProviderMigrationProfile(provider); }
  catch (error) { fail(error.message); }
  const capabilityPolicyError = validateProviderMigrationCapabilities(profile, desired);
  if (capabilityPolicyError) fail(capabilityPolicyError);

  const current = db.prepare('SELECT capability AS name, priority, enabled FROM capability_binding WHERE provider_id=? ORDER BY capability').all(providerId);
  const alreadyCurrent = current.length === desired.length && current.every((item, index) => (
    item.name === desired[index].name && item.priority === desired[index].priority && Number(item.enabled) === 1
  ));
  if (alreadyCurrent) {
    console.log(JSON.stringify({ event: 'provider.capabilities.migration', providerId, component: profile.component, contractVersion: profile.contractVersion, status: 'UNCHANGED', count: desired.length }));
    process.exit(0);
  }

  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM capability_binding WHERE provider_id=?').run(providerId);
    const insert = db.prepare('INSERT INTO capability_binding(capability,provider_id,priority,enabled) VALUES(?,?,?,1)');
    for (const capability of desired) insert.run(capability.name, providerId, capability.priority);
    db.prepare('UPDATE provider_registration SET updated_at=? WHERE id=?').run(now, providerId);

    const auditTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='audit_event'").get();
    if (auditTable) {
      db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
        randomUUID(),
        'system:local-uat-provider-migration',
        'local-uat-sync',
        'provider.capabilities.update',
        `provider:${providerId}`,
        now,
        JSON.stringify({
          source: profile.auditSource,
          previous: current.map((item) => ({ name: item.name, priority: item.priority, enabled: Boolean(item.enabled) })),
          desired,
        }),
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const verified = db.prepare('SELECT capability AS name, priority, enabled FROM capability_binding WHERE provider_id=? ORDER BY capability').all(providerId);
  if (verified.length !== desired.length || !verified.every((item, index) => (
    item.name === desired[index].name && item.priority === desired[index].priority && Number(item.enabled) === 1
  ))) fail('post_migration_verification_failed');

  console.log(JSON.stringify({ event: 'provider.capabilities.migration', providerId, component: profile.component, contractVersion: profile.contractVersion, status: 'UPDATED', previousCount: current.length, count: desired.length }));
} finally {
  db.close();
}
