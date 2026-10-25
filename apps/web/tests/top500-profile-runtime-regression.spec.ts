import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');

function source(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('company import authority is visible and cannot be masked by stale non-protected overrides', () => {
  const client = source('apps/web/src/lib/crmResearchIntakeClient.ts');
  const authority = source('apps/api/research-authoritative-profile.mjs');
  const detail = source('apps/web/src/components/CompanyBasicProfile75Detail.tsx');

  // Legacy TOP500 execution remains a compatibility path while the new generic
  // Company Import Job writes the same authoritative-profile store.
  expect(client).toContain('const authoritative = await executeResearchAuthoritativeBatch(batchId)');
  expect(authority).toContain("url.pathname === '/api/crm-native/research-authoritative-profiles'");
  expect(detail).toContain('insight?.authoritativeProfile?.fields');
  expect(detail).toContain('values[header] = normalizeOverride(authoritative[header])');

  // Once the newest import supplied a non-protected field, an old profile override
  // cannot turn that value back into an older value or "待补充".
  expect(detail).toContain('const importedAuthorityOwnsField = !isProtected');
  expect(detail).toContain('if (importedAuthorityOwnsField) continue;');
  expect(detail).toContain('PROTECTED_OPERATIONAL_RESEARCH_HEADERS.has(header)');
});

test('TOP500 profile surfaces use the active GBAP appearance tokens in dark mode', () => {
  const entry = source('apps/web/src/main.tsx');
  const css = source('apps/web/src/batch17-top500-profile-hardening.css');

  expect(entry.indexOf("import './batch17-top500-profile-hardening.css';"))
    .toBeGreaterThan(entry.indexOf("import './batch16-business-ux.css';"));
  expect(css).toContain('background: var(--fg-surface) !important');
  expect(css).toContain('background: var(--fg-surface-soft) !important');
  expect(css).toContain('color: var(--fg-text-strong) !important');
  expect(css).toContain('border-color: var(--fg-border) !important');
  expect(css).not.toContain('background: #fff');
  expect(css).not.toContain('background: #ffffff');
});
