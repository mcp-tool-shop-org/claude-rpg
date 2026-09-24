# claude-rpg: how it works

Mapped at 2026-09-24 from commit d22db12.

## What this is

8 parts, mostly TypeScript (218 files). Work enters through 5 doors; the busiest is CI, which reaches 3 parts. It publishes to npm. People run claude-rpg. People import @mcptoolshop/claude-rpg.

## What changed since the last map

This is the first map.

## What comes in

1. **CI.** On a pull request touching 12 paths; on a push touching 12 paths; or by hand. Runs scripts/check-critical-coverage.mjs, src/action-interpreter.test.ts, src/bin-defenses.test.ts and 89 more; checks src/ and test/.
2. **Release.** When a tag matching `v*` is pushed. Runs src/action-interpreter.test.ts, src/bin-defenses.test.ts, src/character/builder.test.ts and 88 more; checks src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/claude-rpg** (the package people import). Loads src/index.ts.
5. **claude-rpg** (a command people run). Runs src/bin.ts.

## What happens through CI

1. The workflow runs scripts/check-critical-coverage.mjs in scripts, 86 files in src, and 35 files in test; it checks src/ in src and test/ in test.

## Who reads the results

CI writes nothing this map can see.

## The other doors

**Release** runs src/action-interpreter.test.ts, src/bin-defenses.test.ts, src/character/builder.test.ts and 88 more, checks src/, reaches scripts, publishes to npm, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/claude-rpg** (the package people import) loads src/index.ts.

**claude-rpg** (a command people run) runs src/bin.ts.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 4 doors.
- **scripts** is imported only from tests, by 1 part (test), and sits on the path of 2 doors.
- **test** is imported only from tests, by 1 part (src), and sits on the path of 2 doors.

## What tends to change together

No two source files, other than a file and its own test, changed together often enough to name.

8 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 10 shared commits, since 34 source files reach 10 revisions; the floor falls to 3 when fewer than 20 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

No place this map can see is written, so none goes unread.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

Nothing in this repository writes to a tracked place this map can see.

## Hand-authored

People write .github/, docs/, dogfood/, the repository root and site/; 5 writes with paths built at run time may land here.

## Where to start

.github/workflows/ci.yml → scripts/check-critical-coverage.mjs

Read those in order to follow one pull request end to end.

## What this map cannot see

- 2 import sites could not be resolved.
- 10 files use syntax the parser cannot read (src/character/session-recap.ts, src/dialogue/npc-context.test.ts, src/game.test.ts and 7 more), so what they import is not known: 8 in src (`typeof import(…)` as a type argument in 7 and an import type followed by `[]` in 1), 2 in test (`typeof import(…)` as a type argument).
- 5 writes and 3 reads use paths built at run time and are not named here.
- 2 writes and 2 reads go to the directory the command is run in, the home directory or a path its caller passes, not to this repository.
- 1 command is built at run time and not followed, it in tests.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
