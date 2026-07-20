---
name: aet-researching-cve
description: Aggregate CVE vulnerability intelligence from MITRE/NVD/OSV + web search + vendor advisories, persisting a structured JSON + Markdown report + disclosure assets to `.aet/bugfix/{CVE-ID}/`.
---

## Language Detection and Response

- Automatically detect the language of user input.
- Respond in the same language as the user input.
- JSON field keys are always English (machine contract). Markdown section
  titles follow the user's language.

## Persistence Exception

This skill is an **explicit exception** to the `.aet/` write-prohibition
declared in `aet-diagnosing-bug/SKILL.md`. CVE artifacts are high-value
cross-task cache assets and MUST persist regardless of whether the parent
bugfix workflow is in Feature mode or In-memory mode. All outputs land
under `.aet/bugfix/{CVE-ID}/`.

## When to Use

- Called from the `aet-bugfix` agent when input contains a `CVE-YYYY-NNNNN`
  identifier.
- May also be invoked directly when a user wants a comprehensive
  vulnerability report.

## Input

- `cveId` (required) — must match `/^CVE-\d{4}-\d{4,7}$/`
- `outputDir` (optional) — defaults to `.aet/bugfix/{cveId}/`
- `sourceUrl` (optional) — the URL the CVE was discovered from, when the caller
  found it by fetching a URL rather than from direct text (the bugfix agent's
  Step 1 Pass B). `null` for a direct-text CVE. Recorded in the JSON so
  downstream knows the provenance.
- `sourceHtmlContent` (optional) — the verbatim fetched page body that surfaced
  the CVE. When provided, it is written to `ISSUE.html` for provenance. `null`
  when the CVE came from direct input.

## Output

A JSON object: `{ cveDir, jsonPath }`.

Side effects — four files plus an optional `ISSUE.html` and `poc/` directory written to `outputDir`:

| File / Dir | Content |
|---|---|
| `{cveId}.json` | Aggregated record matching the JSON contract below |
| `{cveId}.md` | Human-readable report rendered from the JSON |
| `{cveId}-disclosure.mbox` | Vendor disclosure email (or placeholder if unobtainable) |
| `{cveId}-oss-security-announce.html` | openwall.com mirror (or placeholder) |
| `ISSUE.html` (optional) | Written only when `sourceHtmlContent` is provided: the verbatim body of the page that surfaced this CVE (Step 1 Pass B), kept for provenance. Absent for direct-text CVEs. |
| `poc/` (dir, optional) | One file per fetched PoC URL: `{n}-{sanitized-filename}` holding the raw response body, or a placeholder beginning `# Failed to fetch …` when WebFetch did not return a useful body. Absent when no PoC URLs were discovered. Files are saved as **data** without executable bit; downstream consumers (e.g. `aet-verifying-cve-fix` L3 oracle) read them as text only — they MUST NOT be executed. |

## JSON Contract

```jsonc
{
  "cveId": "CVE-YYYY-NNNNN",
  "fetchedAt": "ISO-8601",
  "sources": {
    "mitre":   "ok" | "failed: <reason>",
    "nvd":     "ok" | "failed: ...",
    "osv":     "ok" | "failed: ...",
    "webSearch": "ok" | "failed: ...",
    "vendorAdvisories": { "<url>": "ok" | "failed: ..." }
  },
  "summary": {
    "title": "...", "description": "...",
    "severity": "HIGH", "cvssScore": 7.8,
    "cvssVector": "CVSS:3.1/...", "cwe": "CWE-669"
  },
  "affectedProducts": [
    {
      "vendor": "Linux", "product": "Linux",
      "repo": "https://git.kernel.org/.../linux.git",
      "programFiles": ["..."],
      "branches": [
        {
          "branch": "linux-6.6.y", "fixedIn": "6.6.137",
          "fixCommit": "3115af9644c3...",
          "patchUrls": [
            "https://git.kernel.org/stable/c/<hash>",
            "https://github.com/gregkh/linux/commit/<hash>.patch"
          ]
        }
      ]
    }
  ],
  "references": [
    { "url": "...", "tag": "mitigation" | "exploit" | "government-resource" | "patch" | "third-party-advisory" | null }
  ],
  "exploitation": {
    "cisaKev": true, "kevAddedAt": "YYYY-MM-DD",
    "publicPoC": ["<url>", "..."],
    "pocAssets": [
      {
        "url": "<source URL, also in publicPoC[]>",
        "localPath": "<abs path under {outputDir}/poc/ or null if fetch failed>",
        "status": "ok" | "failed: <reason>",
        "sha256": "<hex of saved body, or null on failure>",
        "contentType": "<HTTP Content-Type or inferred, e.g. text/x-csrc>"
      }
    ]
  },
  "vendorSummaries": [ { "url": "...", "title": "...", "extract": "..." } ],
  "rawCveRecord": { /* full MITRE JSON, fallback */ }
}
```

## Workflow

### Step 1: Validate input and prepare output directory

- Validate `cveId` against `/^CVE-\d{4}-\d{4,7}$/`. If invalid, throw.
- `outputDir = outputDir || .aet/bugfix/{cveId}/`
- Ensure `outputDir` exists (`mkdir -p`).

### Step 2: Fetch baseline from MITRE / NVD / OSV

Run the bundled script:

```bash
node skills/aet-researching-cve/scripts/vulinfo.js --id {cveId} --format=json
```

Capture stdout as the baseline aggregated object. Each source's status is
already recorded inside.

### Step 3: Web enrichment (parallel, bounded)

**Budget: 60s total, max 4 concurrent requests, 10s per request.**

Run three groups concurrently:

1. **WebSearch with fixed keyword templates** — for each suffix in
   `["advisory", "patch", "PoC", "exploit", "mitigation"]`, search
   `"{cveId} <suffix>"`. Collect distinct URLs into `references[]`.
   On failure: `sources.webSearch = "failed: <reason>"`, continue.

2. **WebFetch vendor advisories** — iterate `references[]` where
   `tag ∈ {"mitigation", "government-resource"}`. For each URL, WebFetch
   (10s timeout); store the first ~500 chars of extracted body into
   `vendorSummaries[]`. Per-URL failures recorded in
   `sources.vendorAdvisories[url]`.

3. **Mirror fallback** — when a `kernel.org` URL fails, automatically
   retry with the GitHub mirror equivalent:
   - `git.kernel.org/stable/c/<hash>` → `github.com/gregkh/linux/commit/<hash>.patch`
   - Mainline → `github.com/torvalds/linux/commit/<hash>.patch`

### Step 4: Capture disclosure assets

**`{cveId}-disclosure.mbox`:**
1. Priority 1 — extract `Message-ID` from `references[]` matching
   `lore.kernel.org/.../<msgid>/`. Try `https://lore.kernel.org/all/{msgid}/raw`.
2. Priority 2 — find the oss-security announcement URL; if it contains
   reconstruction-worthy headers and body, synthesize an mbox with
   `From: ... \nSubject: ... \nDate: ... \n\n<body>`.
3. Fallback — write a placeholder file beginning with
   `# Failed to fetch — sources tried: <list>`.

**`{cveId}-oss-security-announce.html`:**
- Find first URL in `references[]` matching
  `openwall.com/lists/oss-security/*`.
- WebFetch (10s); save body verbatim. On failure, write a placeholder
  with the same `# Failed to fetch` header.

**`poc/{n}-{sanitized-filename}` (PoC assets — new):**

The candidate URL list is the **deduped union** of
`exploitation.publicPoC[]` and `references[]` entries whose `tag` is
`"exploit"`. If empty, skip — no `poc/` directory is created and
`pocAssets` is `[]`.

For each candidate URL `u` (in stable encounter order, indexed `n`
starting at 1):

1. `mkdir -p {outputDir}/poc/` (lazy — only on the first asset).
2. **WebFetch** `u` with a 10s timeout. The PoC URL is treated as a
   **document fetch**, never as code: no shell, no `eval`, no `chmod
   +x`. The skill itself never executes the response.
3. Derive the local filename:
   - Start from the URL's last path segment after stripping query/fragment.
   - Sanitize: replace any `[^A-Za-z0-9._-]` with `_`; collapse repeats.
   - If empty or extensionless, infer extension from the response
     Content-Type: `text/x-csrc` → `.c`, `text/x-python` → `.py`,
     `text/x-shellscript` → `.sh`, otherwise `.txt`.
   - Prepend the zero-padded index: `{n:02d}-{name}`.
4. Save the **raw response body** (text or binary) to
   `{outputDir}/poc/{n:02d}-{name}` with file mode `0644` (no execute
   bit). Compute sha256 of the saved bytes.
5. Append to `exploitation.pocAssets[]`:
   `{ url: u, localPath: <abs>, status: "ok", sha256, contentType }`.

On per-URL failure (timeout, non-2xx, empty body, network error):
- Write a placeholder file `{outputDir}/poc/{n:02d}-failed.txt` whose
  first line is `# Failed to fetch — url: <u>, reason: <reason>`.
- Append `{ url: u, localPath: <placeholder abs path>, status: "failed:
  <reason>", sha256: null, contentType: null }` to `pocAssets[]`. Keep
  going for the remaining URLs — never abort the run on a PoC fetch
  failure (PoC capture is best-effort).

⚠️ **Safety contract for PoC assets** — repeated here because downstream
agents rely on it:
- Files in `poc/` are **data**, not programs. This skill never invokes
  them and downstream skills MUST NOT either; they read them as text
  to derive a safe sentinel oracle (see
  `aet-verifying-cve-fix/references/poc-to-oracle.md`).
- Save without the executable bit. If a future change adds a script
  hook, do not `chmod +x` PoC files.
- If a PoC URL points at a multi-file archive (`.tar.gz`, `.zip`),
  store the archive verbatim and let the verify skill's L3 sub-agent
  decide what to extract — do **not** auto-extract here.

### Step 5: Assemble final JSON per contract

Critical mapping: raw MITRE `affected[].versions[]` (`versionType: "git"`
ranges) → flattened `affectedProducts[].branches[]`. One branch entry per
fix commit listed in the CVE record. For each, auto-derive `patchUrls[]`:
- Primary: `https://git.kernel.org/stable/c/<fixCommit>`
- Mirror:  `https://github.com/gregkh/linux/commit/<fixCommit>.patch`
- For mainline commits, also append `github.com/torvalds/linux/...`.

The `branch` slug should be derived from the `lessThanOrEqual` semver
constraint (e.g. `6.6.*` → `linux-6.6.y`; `*` → `mainline`).

### Step 6: Render the Markdown report

```bash
node skills/aet-researching-cve/scripts/render-md.js {outputDir}/{cveId}.json \
  > {outputDir}/{cveId}.md
```

### Step 7: Write JSON and return

- Write the aggregated JSON to `{outputDir}/{cveId}.json` (pretty-printed,
  2-space indent).
- Return `{ cveDir: outputDir, jsonPath: {outputDir}/{cveId}.json }`.

## Failure Handling

- **Any single source failure** → record in `sources.*`, continue. Never
  abort the whole flow on partial failure.
- **Minimum guarantee** → JSON and MD always written, even if all sources
  failed (the resulting JSON will have empty `affectedProducts` and
  downstream `aet-locating-cve-fix` will take the no-match path).
- **Total network outage** → consult `scripts/.vuln-cache.json`; on cache
  miss, write a skeleton JSON + an MD noting the network failure.
- **Invalid `cveId`** → throw immediately.
- **Re-run on existing CVE dir** → overwrite (no `--force` needed; newer
  data may carry CISA KEV updates).

## Scripts

- `scripts/vulinfo.js` — multi-source baseline fetch. Supports
  `--format=markdown` (default, back-compat with `aet-diagnosing-bug`) and
  `--format=json` (used here).
- `scripts/render-md.js` — JSON → MD renderer. Pure Node stdlib.
- `scripts/.vuln-cache.json` — 24h cache (managed by `vulinfo.js`).

## Red Flags — Return to Earlier Step

- Aborting on partial source failure (must continue and record)
- Writing files outside `outputDir`
- Modifying the local repository (this skill is read-only beyond
  `outputDir`)
- Calling `vulinfo.js` without `--format=json` (the markdown output is for
  `aet-diagnosing-bug`, not this skill)
- **Executing or extracting a fetched PoC asset.** PoC files are saved
  as data only — no `chmod +x`, no `python {file}`, no `bash {file}`,
  no `tar -xf`, no `unzip`. Treat the `poc/` directory as immutable
  evidence the verify skill reads as text.
