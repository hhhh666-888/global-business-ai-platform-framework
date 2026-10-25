import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync('providers/knowledge-extractor/Dockerfile', 'utf8');
const common = readFileSync('infrastructure/knowledge-runtime/Knowledge-UAT.Common.ps1', 'utf8');
const start = readFileSync('infrastructure/knowledge-runtime/Start-GBAP-Knowledge-UAT.ps1', 'utf8');
const install = readFileSync('infrastructure/knowledge-runtime/Install-GBAP-Knowledge-UAT.ps1', 'utf8');

assert.match(dockerfile, /ARG GBAP_DEBIAN_MAIN_MIRROR=https:\/\/mirrors\.tuna\.tsinghua\.edu\.cn\/debian/u);
assert.match(dockerfile, /ARG GBAP_DEBIAN_SECURITY_MIRROR=https:\/\/security\.debian\.org\/debian-security/u);
assert.match(dockerfile, /\$\{GBAP_DEBIAN_MAIN_MIRROR\}/u);
assert.match(dockerfile, /\$\{GBAP_DEBIAN_SECURITY_MIRROR\}/u);
assert.doesNotMatch(dockerfile, /http:\/\/deb\.debian\.org/u);
assert.match(dockerfile, /Acquire::Retries "5"/u);
assert.match(dockerfile, /Acquire::https::Timeout "30"/u);
assert.match(dockerfile, /# syntax=docker\/dockerfile:1\.7/u);
assert.match(dockerfile, /GBAP_APT_CORE_ATTEMPT=\$\{attempt\}\/4/u);
assert.match(dockerfile, /GBAP_APT_OFFICE_ATTEMPT=\$\{attempt\}\/4/u);
assert.match(dockerfile, /GBAP_APT_FONTS_ATTEMPT=\$\{attempt\}\/4/u);
assert.match(dockerfile, /GBAP_PIP_ATTEMPT=\$\{attempt\}\/4/u);
assert.match(dockerfile, /PIP_RETRIES=8/u);
assert.match(dockerfile, /PIP_DEFAULT_TIMEOUT=60/u);
assert.match(dockerfile, /--mount=type=cache,id=gbap-knowledge-apt-cache,target=\/var\/cache\/apt,sharing=locked/u);
assert.match(dockerfile, /--mount=type=cache,id=gbap-knowledge-apt-lists,target=\/var\/lib\/apt\/lists,sharing=locked/u);
assert.match(dockerfile, /--mount=type=cache,id=gbap-knowledge-pip-cache,target=\/root\/\.cache\/pip,sharing=locked/u);
assert.match(dockerfile, /Binary::apt::APT::Keep-Downloaded-Packages "true"/u);
assert.doesNotMatch(dockerfile, /rm -rf \/var\/lib\/apt\/lists/u);

assert.match(common, /function Start-KnowledgeAdapterStack/u);
assert.match(common, /BuildAttempts = 3/u);
assert.match(common, /docker compose -p \$Lock\.runtime\.adapterProject -f \$ComposeFile build/u);
assert.match(common, /up -d --no-build/u);
assert.match(common, /retrying in \$delay seconds/u);

for (const [name, source] of [['start', start], ['install', install]]) {
  assert.match(source, /Start-KnowledgeAdapterStack/u, name);
  assert.doesNotMatch(source, /up -d --build/u, name);
}

console.log(JSON.stringify({
  gate: 'GBAP_KNOWLEDGE_EXTRACTOR_BUILD_SUPPLY',
  result: 'PASS',
  debianMainMirror: 'https://mirrors.tuna.tsinghua.edu.cn/debian',
  debianSecurityAuthority: 'https://security.debian.org/debian-security',
  aptRetries: 5,
  aptBuildkitCache: true,
  splitDependencyLayers: ['core', 'office', 'fonts'],
  dockerBuildAttempts: 3,
  pipRetries: 8,
  pipBuildkitCache: true,
  startAfterBuild: '--no-build',
}));
