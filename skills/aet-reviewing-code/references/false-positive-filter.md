# False-Positive Filter — Exclude List

The #1 anti-pattern in PR review: **comments full of noise, the author tunes out, real problems get buried**.
This list draws on `anthropic/claude-code-security-review` + `anthropic/claude-code`'s built-in code-review plugin exclude lists. **After LLM review, run findings through this filter.**

## Findings to Drop

### 1. Issues Not Introduced by This PR

❌ Reporting a problem in code that's **not in the current diff** (the LLM just happened to notice it).

**Check**: use patch.diff to verify whether the lines the finding refers to are in the `+` / `@@` range. If not → drop.

> **Exception**: if it's the same file, the PR did touch adjacent code, and **the author should reasonably have noticed**, you may keep it as `learning` (informing them of an existing problem).

### 2. Linter-Catchable

❌ Variable name typos / import order / trailing whitespace / unused imports / `==` vs `===` / etc.

**Check**: tools like ESLint / Prettier / ruff / golangci-lint catch these. Don't duplicate them in LLM review.

> **Exception**: if the project clearly has **no linter configured**, keep at most 1–2 of the most critical findings — but the comment should suggest "configure a linter" rather than enumerate each instance.

### 3. Pedantic Nitpicks

❌ Style preferences with no concrete technical reason ("I'd write it this way")
❌ Details that don't affect comprehension ("'used to' should be 'used for' in the comment")

**Check**: when writing the finding, ask "if this gets fixed, **what specifically** improves?" If the only answer is "reads more smoothly" / "personal preference" → drop.

### 4. Comment / Doc Typos

❌ Spelling errors in comments, punctuation in docs (unless they affect comprehension).

> **Exception**: typos in user-facing docs (README / user docs) → keep as `nit`.

### 5. Duplicate Findings

❌ The same problem reported at multiple locations.

**Check**: multiple findings describing the same issue (only differ in file:line) → merge into 1, and list "see also lines X / Y" in the body.

### 6. Already lint-ignored

❌ The code has `// eslint-disable-next-line` / `# noqa` / `// nolint` etc. — the author **actively opted out**.

**Check**: examine the **3 lines before and after** the finding's line for an ignore comment. If found → drop by default (unless the finding is about whether the ignore is reasonable).

### 7. Low-Impact Security Issues (security-review specific)

❌ DoS / rate limiting / memory exhaustion / generic input validation (without clear impact) / open redirects.

**Check**: these have low realistic exploitability in production, and high attacker cost. Reference implementations drop them by default. See `findings_filter.py` in `anthropic/claude-code-security-review`.

## Findings NOT to Drop (Commonly Misjudged)

- ✅ **Boundary handling missing on critical paths**: keep even if it looks simple
- ✅ **Any finding on a file that hit a risk-face**: keep even at `nit` (the author will want to verify)
- ✅ **Missing tests on critical functionality**: keep at `important`
- ✅ **Author explicitly asked for review on this part**: keep even at `nit` (respect reviewer ask)

## Post-Filter Finding Counts

For a medium PR (3–10 files, 100–500 diff lines), expect **5–15 findings after filtering**:
- < 5: LLM may be too lenient — investigate
- 5–15: healthy
- 15–25: borderline; consider merging
- > 25: likely noise explosion — filtering logic isn't working

## Anti-Patterns

❌ **Filtering out all nit/suggestion**: these are the soul of review. Filtering them all makes the review feel like it's only flagging big problems. MVP should keep at least 1–2 nit/suggestion findings if available.

❌ **Filtering praise**: praise is the anti-cynicism filter — reference implementations stress that positive feedback is critical for author experience. **Never filter praise.**

❌ **Mechanical truncation by count**: "keep top 10" is a crude strategy that drops real problems. Filter by the 7 categories above.
