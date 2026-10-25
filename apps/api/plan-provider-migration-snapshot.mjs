import { DatabaseSync } from 'node:sqlite';

const dbPath = process.env.DB_PATH;
if (!dbPath) {
  console.error('DB_PATH is required.');
  process.exit(2);
}

const targets = Object.freeze([
  Object.freeze({ id: 'twenty-crm-uat', component: 'twenty-crm', contractVersion: 'gbap.crm.v1' }),
]);

function fail(message, detail = {}) {
  console.error(JSON.stringify({ event: 'provider.migration.snapshot-plan', result: 'FAIL', error: message, ...detail }));
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='provider_registration'").get();
  const rows = table
    ? db.prepare('SELECT id, component, contract_version FROM provider_registration ORDER BY id').all()
    : [];

  const plan = [];
  for (const target of targets) {
    const exact = rows.find((row) => row.id === target.id);
    const conflicts = rows.filter((row) =>
      row.id !== target.id &&
      (row.component === target.component || row.contract_version === target.contractVersion)
    );

    if (conflicts.length > 0) {
      fail('provider_identity_conflict', {
        expected: target,
        conflicts: conflicts.map((row) => ({
          id: row.id,
          component: row.component,
          contractVersion: row.contract_version ?? null,
        })),
      });
    }

    if (!exact) {
      plan.push({ ...target, action: 'BOOTSTRAP_REQUIRED' });
      continue;
    }

    if (exact.component !== target.component) {
      fail('provider_component_mismatch', {
        providerId: target.id,
        actual: exact.component,
        expected: target.component,
      });
    }
    if (exact.contract_version !== target.contractVersion) {
      fail('provider_contract_version_mismatch', {
        providerId: target.id,
        actual: exact.contract_version ?? null,
        expected: target.contractVersion,
      });
    }

    plan.push({ ...target, action: 'MIGRATE' });
  }

  console.log(JSON.stringify({
    event: 'provider.migration.snapshot-plan',
    result: 'PASS',
    providerTablePresent: Boolean(table),
    persistedProviderCount: rows.length,
    plan,
  }));
} finally {
  db.close();
}
