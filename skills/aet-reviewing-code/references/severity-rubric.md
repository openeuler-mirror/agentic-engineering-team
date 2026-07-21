# Severity Rubric — 6 Tiers

Adapted from `awesome-skills/code-review-skill`, tuned for PR review.
**Severity = how serious the finding is / what the reviewer should do**. This is orthogonal to "risk-face" (which sensitive area the change touches).

## 6 Tiers

| Tier | Emoji | Meaning | Triggers PR verdict |
|---|---|---|---|
| `blocking` | ⛔ | Must be fixed before merge. Clear bug / security hole / compliance break / critical contract break | ⛔ BLOCKING |
| `important` | ⚠️ | Should be fixed; may block depending on context. Obvious design issue / error-prone boundary / perf issue | ⚠️ NEEDS ATTENTION |
| `nit` | 🟡 | Minor; optional. Naming / style detail / minor blemish that doesn't affect understanding | ✅ LGTM |
| `suggestion` | 🔵 | Optional improvement. Refactor / reuse opportunity / more idiomatic alternative | ✅ LGTM |
| `learning` | 📚 | Educational note. Background useful to the author (or future readers); no action required | ✅ LGTM |
| `praise` | 🌟 | Highlight strong work. Reinforce good design / docs / tests | ✅ LGTM |

## Decision Tree

```
Would NOT fixing this cause a production risk / data loss / security hole?
  ├─ Yes → blocking
  └─ No
      └─ Does it affect correctness / performance / maintainability enough that the author should seriously consider it?
          ├─ Yes → important
          └─ No
              └─ Is it an improvement suggestion?
                  ├─ Style / naming / micro-detail → nit
                  ├─ Refactor / reuse / better idiom → suggestion
                  ├─ Background / design pattern / education → learning
                  └─ Compliment → praise
```

## Mapping from `aet-reviewing-code` Kernel

`aet-reviewing-code` uses Critical / High / Medium / Low. Map to 6 tiers as follows:

| Kernel tier | Maps to | Notes |
|---|---|---|
| Critical | blocking | Pass through |
| High | important | Pass through |
| Medium | nit | "Should fix but negotiable" semantics |
| Low | suggestion | "Nice to have" improvement |
| (n/a) | learning | LLM may add `learning` (didactic) instead of `nit` |
| (n/a) | praise | LLM proactively identifies bright spots — not from kernel mapping |

## Anti-Patterns

❌ **Conflating "severity" with "risk-face"**: a change touches the auth path but it's only a doc typo — severity should be `nit`, risk-face is `auth`. **Don't bump severity just because risk-face is auth**. They are independent.

❌ **Mechanically applying kernel mapping**: the LLM should use its own judgment to adjust severity, not just convert kernel tiers blindly. E.g. kernel flagged High but on careful read it's actually low risk → downgrade to nit.

❌ **Missing praise/learning**: reference implementations consistently show that purely-negative reviews damage the developer experience. The LLM should actively look for bright spots and teaching moments, not just nitpick.
