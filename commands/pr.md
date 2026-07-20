---
description: PR management for AtomGit PRs — create / update / list / comment / review. Use natural language. Examples - "create PR for this feature", "list open PRs", "review PR 226", "post comment on PR 226".
disable-model-invocation: true
---

Automatically detect the language of user input and respond in the same language.

## Intent routing

Based on the user's input, dispatch to one of two skills:

- **Review intent** (keywords: "review", "评审", "code review", "check the PR", "review PR #N"):
  → Invoke the `aet-reviewing-pr` skill with the provided arguments.

- **All other PR intents** (create / update / list / get / add-comment / delete-comment):
  → Invoke the `aet-operating-pr` skill with the provided arguments.

Then execute exactly as the chosen skill presents.

## Common usage patterns

### Operating intents (→ `aet-operating-pr`)
- `/aet-pr create PR for this feature ...`
- `/aet-pr update PR 226 title to "..."`
- `/aet-pr list open PRs`
- `/aet-pr get PR 226`
- `/aet-pr comment on PR 226: ...`

### Review intent (→ `aet-reviewing-pr`)
- `/aet-pr review 226` — full review on PR 226, comment auto-posted
- `/aet-pr review 226 --dry-run` — produce artifacts but don't post
- `/aet-pr review 226 --no-post` — same as --dry-run
- `/aet-pr review https://atomgit.com/owner/repo/merge_requests/226` — by URL
- `/aet-pr review 226 --include-draft` — force review of draft PR
