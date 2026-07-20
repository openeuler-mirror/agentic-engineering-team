#!/usr/bin/env node
// Smoke test for render-md.js.
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPT  = path.join(__dirname, 'render-md.js');
const FIXTURE = 'C:/Users/13909/Desktop/adt/VulInfo/CVE-2026-31431.json';

if (!fs.existsSync(FIXTURE)) {
  console.error(`FAIL: fixture missing: ${FIXTURE}`);
  process.exit(2);
}

// Build a stripped fixture that matches our JSON contract (not raw MITRE).
const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf-8'));
const aggregated = {
  cveId: raw.cveMetadata.cveId,
  fetchedAt: new Date().toISOString(),
  sources: { mitre: 'ok', nvd: 'failed: timeout', osv: 'ok', webSearch: 'ok', vendorAdvisories: {} },
  summary: {
    title:       raw.containers.cna.title,
    description: raw.containers.cna.descriptions[0].value,
    severity:    raw.containers.cna.metrics[0].cvssV3_1.baseSeverity,
    cvssScore:   raw.containers.cna.metrics[0].cvssV3_1.baseScore,
    cvssVector:  raw.containers.cna.metrics[0].cvssV3_1.vectorString,
    cwe:         'CWE-669',
  },
  affectedProducts: [{
    vendor: 'Linux', product: 'Linux',
    repo: raw.containers.cna.affected[0].repo,
    programFiles: raw.containers.cna.affected[0].programFiles,
    branches: [
      { branch: 'linux-6.6.y', fixedIn: '6.6.137',
        fixCommit: '3115af9644c342b356f3f07a4dd1c8905cd9a6fc',
        patchUrls: ['https://git.kernel.org/stable/c/3115af9644c342b356f3f07a4dd1c8905cd9a6fc'] }
    ],
  }],
  references: [{ url: 'https://copy.fail', tag: 'mitigation' }],
  exploitation: { cisaKev: true, kevAddedAt: '2026-05-01', publicPoC: ['https://copy.fail'] },
  vendorSummaries: [],
  rawCveRecord: raw,
};

// Write to temp file
const tmpJson = path.join(__dirname, '.test-fixture.json');
fs.writeFileSync(tmpJson, JSON.stringify(aggregated));

const result = spawnSync('node', [SCRIPT, tmpJson], { encoding: 'utf-8' });
fs.unlinkSync(tmpJson);

if (result.status !== 0) {
  console.error(`FAIL: exit ${result.status}\nstderr: ${result.stderr}`);
  process.exit(1);
}
const md = result.stdout;

const required = [
  '# CVE-2026-31431',
  '## Summary',
  '## Severity',
  '## Affected Versions',
  'linux-6.6.y',
  '6.6.137',
  '## Affected Files',
  'crypto/algif_aead.c',
  '## References',
  '## Source Status',
  'mitre: ok',
  'nvd: failed',
];
const missing = required.filter(s => !md.includes(s));
if (missing.length) {
  console.error('FAIL: missing sections/content:', missing);
  process.exit(1);
}
console.log('PASS');
