# Lessons

Patterns from corrections. One entry per pattern, newest first.

## 2026-11-04: Derive every filter rule from "I can't act on this because…"

**What happened.** The stage 3 filter shipped with title and contract rules and no location rule. The digest then offered an "apply" signal whose roles were on-site in Ahmedabad and Mexico City to an owner who works remotely from Croatia. The v1 spec had listed "countries outside scope" as a stage 3 drop; the row 1 brief carried over the title rules and left that one out. When asked which countries the rule should cover, the planner assumed EU + UK + US + Canada; the plan's own rubric scores "other EU" at zero and Canada appears nowhere.

**The fault.** Checking that a posting was engineering and contract, not that the owner could take it. Then filling the gap with an assumption instead of a question.

**The rule.** Before a filter or routing rule is written, ask the owner the sentence "I can't act on this because…" for each kind of noise, and build the rule from the answers verbatim (recorded in DECISIONS.md). Where the owner's answer depends on a judgment the pipeline can't make (hybrid "if the pay covers monthly flights"), keep and tag, don't drop.

## 2026-11-02: Plan from the buyer, not from the signal

**What happened.** Asked why the fingerprint adapter exists, the planner argued from what the data reveals (a migration is happening, the stack is X) and repeated the spec's "highest-value signal" claim with added rhetoric. Three one-line challenges from the owner ("don't they already have the capability?", "they have an agency during the build, why me?") dismantled it. None had been asked during planning.

**The fault.** Treating SPEC.md as evidence rather than as an unchallenged draft, and answering "what is the reason for X" as advocacy instead of evaluation.

**The rule.** Before planning any build-order row or defending any stage, write the buyer test in one line: who pays, when, and why me instead of whoever is already there. If the row can't answer it, say so before building. "Don't reverse a decision without a new fact" means go find the fact, not don't question.
