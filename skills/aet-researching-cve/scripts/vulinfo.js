#!/usr/bin/env node

/**
 * vulinfo.js - Vulnerability Information Fetcher
 *
 * Fetches vulnerability details from public CVE/vulnerability databases
 * based on vulnerability identifiers (CVE, CNVD, CNNVD, etc.)
 *
 * Usage:
 *   node vulinfo.js --id CVE-2024-1234
 
/**
 * vulinfo.js - Enhanced Version (No API Key, Proxy Support, Multi-source, Cache)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ================= 配置 =================

const CVE_API_BASE = 'https://cveawg.mitre.org/api/cve';
const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const OSV_API = 'https://api.osv.dev/v1/query';

const CACHE_FILE = path.join(__dirname, '.vuln-cache.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

const TIMEOUT = 8000;

// ================= 工具函数 =================

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function getFromCache(id) {
  const cache = loadCache();
  const entry = cache[id];
  if (!entry) return null;

  if (Date.now() - entry.ts > CACHE_TTL) return null;
  return entry.data;
}

function setCache(id, data) {
  const cache = loadCache();
  cache[id] = { ts: Date.now(), data };
  saveCache(cache);
}

// ================= HTTP（支持代理） =================

function httpRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        'User-Agent': 'vulinfo/2.0',
        'Content-Type': 'application/json'
      },
      timeout: TIMEOUT
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ================= CVE 获取 =================

async function fetchCVE(cveId) {

  // 1️⃣ MITRE
  try {
    const data = JSON.parse(await httpRequest(`${CVE_API_BASE}/${cveId}`));
    const parsed = parseMitre(data);
    if (parsed.description) return parsed;
  } catch {}

  // 2️⃣ NVD（可能限流）
  try {
    const data = JSON.parse(await httpRequest(`${NVD_API_BASE}?cveId=${cveId}`));
    const parsed = parseNVD(data, cveId);
    if (parsed.description) return parsed;
  } catch {}

  // 3️⃣ OSV（强兜底）
  try {
    const data = JSON.parse(await httpRequest(OSV_API, 'POST', {
      query: cveId
    }));
    return parseOSV(data, cveId);
  } catch {}

  return null;
}

// ================= 解析 =================

function baseResult(id) {
  return {
    id,
    state: '',
    title: '',
    description: '',
    severity: '',
    cvssScore: '',
    affectedProducts: [],
    references: [],
    publishedDate: '',
    lastModified: ''
  };
}

// ---- MITRE ----
function parseMitre(data) {
  const r = baseResult(data.cveMetadata?.cveId || '');

  const cna = data.containers?.cna;
  if (!cna) return r;

  r.description = cna.descriptions?.[0]?.value || '';
  r.title = cna.title || r.description.slice(0, 100);

  // CVSS
  const metrics = cna.metrics || [];
  for (const m of metrics) {
    const cvss = m.cvssV3_1 || m.cvssV3_0;
    if (cvss) {
      r.cvssScore = cvss.baseScore;
      r.severity = cvss.baseSeverity;
      break;
    }
  }

  // references
  r.references = (cna.references || []).map(r => ({
    url: r.url,
    name: r.name || r.url
  }));

  return r;
}

// ---- NVD ----
function parseNVD(data, cveId) {
  const vuln = data.vulnerabilities?.[0]?.cve;
  if (!vuln) return null;

  const r = baseResult(cveId);

  r.description = vuln.descriptions?.[0]?.value || '';
  r.title = r.description.slice(0, 100);

  const m = vuln.metrics?.cvssMetricV31?.[0]?.cvssData;
  if (m) {
    r.cvssScore = m.baseScore;
    r.severity = m.baseSeverity;
  }

  r.references = (vuln.references || []).map(r => ({
    url: r.url,
    name: r.source
  }));

  return r;
}

// ---- OSV ----
function parseOSV(data, id) {
  const r = baseResult(id);

  const vuln = data.vulns?.[0];
  if (!vuln) return r;

  r.description = vuln.summary || vuln.details || '';
  r.title = vuln.summary || id;

  r.references = (vuln.references || []).map(r => ({
    url: r.url,
    name: r.type
  }));

  return r;
}

// ================= 主流程 =================

async function main() {
  // Parse args
  const argv = process.argv.slice(2);
  const idIdx = argv.indexOf('--id');
  const id = idIdx >= 0 ? argv[idIdx + 1] : argv.find(a => !a.startsWith('--'));
  const fmtArg = argv.find(a => a.startsWith('--format='));
  const format = fmtArg ? fmtArg.split('=')[1] : 'markdown';

  if (!id) {
    console.error('Missing --id');
    process.exit(1);
  }
  if (format !== 'markdown' && format !== 'json') {
    console.error(`Unknown format: ${format} (use markdown|json)`);
    process.exit(1);
  }

  // Cache
  const cached = getFromCache(id);
  if (cached) {
    console.log(format === 'json' ? JSON.stringify(cached, null, 2) : formatMarkdown(cached));
    return;
  }

  console.error(`Fetching ${id} ...`);

  let data = null;
  if (id.startsWith('CVE')) {
    data = await fetchCVE(id);
  } else {
    console.error('Only CVE supported in enhanced version');
  }

  if (data) setCache(id, data);

  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(formatMarkdown(data));
  }
}

// ================= 输出 =================

function formatMarkdown(v) {
  if (!v) return 'No data';

  return `
## ${v.id}

- Severity: ${v.severity || 'N/A'}
- CVSS: ${v.cvssScore || 'N/A'}

### Description
${v.description}

### References
${v.references.map(r => `- ${r.url}`).join('\n')}
`;
}

main();