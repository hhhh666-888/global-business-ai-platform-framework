import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolveProviderMigrationProfile } from './provider-migration-profile.mjs';

const DB_PATH = process.env.DB_PATH ?? '/data/substrate.db';
const providerId = process.argv[2] ?? '';

function fail(message) {
  console.error(JSON.stringify({ event: 'provider.runtime-provenance.migration.failed', providerId, error: message }));
  process.exit(1);
}

if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(providerId)) fail('invalid_provider_id');

let raw = '';
for await (const chunk of process.stdin) raw += chunk.toString('utf8');
if (!raw.trim()) fail('runtime_provenance_json_required');

let input;
try { input = JSON.parse(raw); }
catch { fail('invalid_runtime_provenance_json'); }

const version = typeof input?.version === 'string' ? input.version.trim() : '';
const upstreamVersion = typeof input?.upstreamVersion === 'string' ? input.upstreamVersion.trim() : '';
const upstreamImageDigest = typeof input?.upstreamImageDigest === 'string' ? input.upstreamImageDigest.trim() : '';
const adapterRevision = typeof input?.adapterRevision === 'string' ? input.adapterRevision.trim() : '';
const configRevision = typeof input?.configRevision === 'string' ? input.configRevision.trim() : '';
const schemaRevision = typeof input?.schemaRevision === 'string' ? input.schemaRevision.trim() : '';

for (const [label, value] of Object.entries({ version, upstreamVersion, adapterRevision, configRevision, schemaRevision })) {
  if (!value || value.length > 255) fail(`invalid_${label}`);
}
if (!/^v\d+\.\d+\.\d+$/.test(version) || version !== upstreamVersion) fail('runtime_version_mismatch');
if (!/^sha256:[a-f0-9]{64}$/i.test(upstreamImageDigest)) fail('invalid_upstream_image_digest');

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

try {
  const provider = db.prepare('SELECT * FROM provider_registration WHERE id=?').get(providerId);
  if (!provider) fail('provider_not_found');
  let profile;
  try { profile = resolveProviderMigrationProfile(provider); }
  catch (error) { fail(error.message); }

  const desired = {
    version,
    upstream_product: profile.upstreamProduct,
    upstream_version: upstreamVersion,
    upstream_digest: upstreamImageDigest,
    adapter_revision: adapterRevision,
    config_revision: configRevision,
    schema_revision: schemaRevision,
  };
  const unchanged = Object.entries(desired).every(([key, value]) => provider[key] === value);
  if (unchanged) {
    console.log(JSON.stringify({ event: 'provider.runtime-provenance.migration', providerId, component: profile.component, contractVersion: profile.contractVersion, status: 'UNCHANGED', version }));
    process.exit(0);
  }

  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE provider_registration
      SET version=?, upstream_product=?, upstream_version=?, upstream_digest=?,
          adapter_revision=?, config_revision=?, schema_revision=?, updated_at=?
      WHERE id=?
    `).run(
      version,
      profile.upstreamProduct,
      upstreamVersion,
      upstreamImageDigest,
      adapterRevision,
      configRevision,
      schemaRevision,
      now,
      providerId,
    );

    const auditTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='audit_event'").get();
    if (auditTable) {
      db.prepare('INSERT INTO audit_event(id,actor_subject,actor_username,action,target,occurred_at,payload_json) VALUES(?,?,?,?,?,?,?)').run(
        randomUUID(),
        'system:local-uat-provider-migration',
        'local-uat-sync',
        'provider.runtime-provenance.update',
        `provider:${providerId}`,
        now,
        JSON.stringify({
          source: profile.auditSource,
          previous: {
            version: provider.version,
            upstreamProduct: provider.upstream_product,
            upstreamVersion: provider.upstream_version,
            upstreamImageDigest: provider.upstream_digest,
            adapterRevision: provider.adapter_revision,
            configRevision: provider.config_revision,
            schemaRevision: provider.schema_revision,
          },
          desired: {
            version,
            upstreamProduct: profile.upstreamProduct,
            upstreamVersion,
            upstreamImageDigest,
            adapterRevision,
            configRevision,
            schemaRevision,
          },
        }),
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const verified = db.prepare('SELECT * FROM provider_registration WHERE id=?').get(providerId);
  if (!verified || Object.entries(desired).some(([key, value]) => verified[key] !== value)) fail('post_migration_verification_failed');

  console.log(JSON.stringify({ event: 'provider.runtime-provenance.migration', providerId, component: profile.component, contractVersion: profile.contractVersion, status: 'UPDATED', version }));
} finally {
  db.close();
}
