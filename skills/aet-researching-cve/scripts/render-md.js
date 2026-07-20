#!/usr/bin/env node
/**
 * render-md.js — Render aggregated CVE JSON to a human-readable Markdown report.
 *
 * Usage: node render-md.js <path-to-json>
 * Output: Markdown on stdout.
 */
const fs = require('fs');

function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) { console.error('Usage: render-md.js <json-path>'); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  const out = [];
  out.push(`# ${j.cveId}`);
  out.push('');
  if (j.fetchedAt) out.push(`> _Fetched at: ${j.fetchedAt}_`);
  out.push('');

  // Summary
  if (j.summary?.description) {
    out.push('## Summary');
    if (j.summary.title) out.push(`**${j.summary.title}**`);
    out.push('');
    out.push(j.summary.description);
    out.push('');
  }

  // Severity
  if (j.summary?.cvssScore || j.summary?.severity || j.summary?.cwe) {
    out.push('## Severity');
    out.push('');
    out.push(`- CVSS: **${j.summary.cvssScore ?? 'N/A'}** (${j.summary.severity ?? 'N/A'})`);
    if (j.summary.cvssVector) out.push(`- Vector: \`${j.summary.cvssVector}\``);
    if (j.summary.cwe) out.push(`- CWE: ${j.summary.cwe}`);
    if (j.exploitation?.cisaKev) {
      out.push(`- **CISA KEV**: yes (added ${j.exploitation.kevAddedAt ?? 'unknown'})`);
    }
    out.push('');
  }

  // Affected Versions table
  const branches = (j.affectedProducts ?? []).flatMap(p =>
    (p.branches ?? []).map(b => ({ ...b, vendor: p.vendor, product: p.product })));
  if (branches.length) {
    out.push('## Affected Versions');
    out.push('');
    out.push('| Branch | Fixed In | Fix Commit |');
    out.push('|---|---|---|');
    for (const b of branches) {
      out.push(`| ${b.branch} | ${b.fixedIn ?? '-'} | \`${(b.fixCommit ?? '').slice(0,12)}\` |`);
    }
    out.push('');
  }

  // Affected Files
  const files = (j.affectedProducts ?? []).flatMap(p => p.programFiles ?? []);
  const uniqFiles = [...new Set(files)];
  if (uniqFiles.length) {
    out.push('## Affected Files');
    out.push('');
    for (const f of uniqFiles) out.push(`- \`${f}\``);
    out.push('');
  }

  // Mitigation (vendor summaries)
  if (j.vendorSummaries?.length) {
    out.push('## Mitigation');
    out.push('');
    for (const v of j.vendorSummaries) {
      out.push(`### ${v.title || v.url}`);
      out.push(`<${v.url}>`);
      out.push('');
      out.push(v.extract ?? '');
      out.push('');
    }
  }

  // References (grouped by tag)
  if (j.references?.length) {
    out.push('## References');
    out.push('');
    const byTag = {};
    for (const r of j.references) {
      const t = r.tag || 'other';
      (byTag[t] = byTag[t] || []).push(r.url);
    }
    for (const tag of Object.keys(byTag).sort()) {
      out.push(`### ${tag}`);
      for (const u of byTag[tag]) out.push(`- <${u}>`);
      out.push('');
    }
  }

  // Public PoC (with local paths if pocAssets[] is present)
  if (j.exploitation?.publicPoC?.length || j.exploitation?.pocAssets?.length) {
    out.push('## Public PoC');
    out.push('');
    const assetByUrl = new Map(
      (j.exploitation?.pocAssets ?? []).map(a => [a.url, a]));
    const urls = j.exploitation?.publicPoC?.length
      ? j.exploitation.publicPoC
      : (j.exploitation?.pocAssets ?? []).map(a => a.url);
    for (const u of urls) {
      const a = assetByUrl.get(u);
      if (a?.status === 'ok' && a.localPath) {
        out.push(`- <${u}> → \`${a.localPath}\` (sha256: \`${(a.sha256 ?? '').slice(0, 12)}\`)`);
      } else if (a?.status?.startsWith('failed')) {
        out.push(`- <${u}> — _${a.status}_`);
      } else {
        out.push(`- <${u}>`);
      }
    }
    out.push('');
  }

  // Timeline (best-effort from rawCveRecord)
  try {
    const tl = j.rawCveRecord?.containers?.adp?.find(a => a.timeline)?.timeline;
    if (tl?.length) {
      out.push('## Timeline');
      out.push('');
      for (const e of tl) out.push(`- ${e.time}: ${e.value}`);
      out.push('');
    }
  } catch {}

  // Source Status (transparency)
  if (j.sources) {
    out.push('## Source Status');
    out.push('');
    for (const [k, v] of Object.entries(j.sources)) {
      if (k === 'vendorAdvisories') continue;
      out.push(`- ${k}: ${v}`);
    }
    if (j.sources.vendorAdvisories && Object.keys(j.sources.vendorAdvisories).length) {
      out.push('- vendorAdvisories:');
      for (const [u, s] of Object.entries(j.sources.vendorAdvisories)) {
        out.push(`  - ${u}: ${s}`);
      }
    }
    out.push('');
  }

  process.stdout.write(out.join('\n'));
}

main();
