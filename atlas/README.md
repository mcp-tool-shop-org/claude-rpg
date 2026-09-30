# claude-rpg: how it works

Mapped at 2026-09-30 from commit e3798b1 by Atlas 1.24.0.

## What this is

8 parts, mostly TypeScript (218 files), JavaScript (3), CSS (2) and Astro (1). Work enters through 5 doors; CI and Release each reach 3 parts, and CI is followed because a pull request goes through it. It publishes to npm. It deploys a site to GitHub Pages. People run claude-rpg. People import @mcptoolshop/claude-rpg.

## What changed since 2026-09-24 (d22db12)

- CI's pull request trigger now also names `codecov.yml`.
- CI's push trigger now also names `codecov.yml`.
- dogfood/tuning/ is now written by test/helpers/living-world-matrix.ts.
- src/game.ts is now also read by src/game.test.ts.
- dogfood was authored and is now mixed.
- 1 file added and 493 changed content, across 8 parts.

## What comes in

1. **CI.** On a pull request touching 13 paths; on a push touching 13 paths; or by hand. Runs src/action-interpreter.test.ts, src/bin-defenses.test.ts, src/character/builder.test.ts and 118 more; checks src/ and test/. On a pull request, it also runs scripts/check-critical-coverage.mjs.
2. **Release.** When a tag matching `v*` is pushed. Runs src/action-interpreter.test.ts, src/bin-defenses.test.ts, src/character/builder.test.ts and 118 more; builds src/.
3. **Deploy site to GitHub Pages.** On a push to main touching 2 paths; or by hand. Runs site/astro.config.mjs and site/src/.
4. **@mcptoolshop/claude-rpg** (the package people import). Loads src/index.ts.
5. **claude-rpg** (a command people run). Runs src/bin.ts.

## What happens through CI

1. The workflow runs 86 files in src and 35 files in test; it checks src/ in src and test/ in test.
2. On a pull request, it also runs scripts/check-critical-coverage.mjs.
3. It writes to dogfood/tuning/.
4. It runs git.
5. It uploads coverage to Codecov.

## Who reads the results

- **dogfood/tuning/** has no reader in this repository.

## The other doors

**Release** runs src/action-interpreter.test.ts, src/bin-defenses.test.ts, src/character/builder.test.ts and 118 more, builds src/, reaches scripts, writes to dogfood/tuning/, publishes to npm, and creates a GitHub release.

**Deploy site to GitHub Pages** runs site/astro.config.mjs and site/src/, and deploys the site.

**@mcptoolshop/claude-rpg** (the package people import) loads src/index.ts.

**claude-rpg** (a command people run) runs src/bin.ts.

## What breaks what

- **src** is imported only from tests, by 1 part (test), and sits on the path of 4 doors.
- **scripts** is imported only from tests, by 1 part (test), and sits on the path of 2 doors.
- **test** is imported only from tests, by 1 part (src), and sits on the path of 2 doors.

## What tends to change together

No two source files, other than a file and its own test, changed together often enough to name.

7 files changed together with their own tests, as expected.

Window: 180 days; a pair counts from 10 shared commits, since 27 source files reach 10 revisions; the floor falls to 3 when fewer than 20 do.

## What no test touches

Every code part is imported by at least one test.

## Written but never read

- **dogfood/tuning/** is written by test/helpers/living-world-matrix.ts (a test) and read by nothing else in this repository.

## Helpers that look duplicated

No two parts export a helper that looks alike.

## Generated, never hand-edited

- **dogfood/tuning/** is written by test/helpers/living-world-matrix.ts (a test) when run from the repository root, and committed.

## Hand-authored

People write .github/, docs/, the repository root and site/. Nothing in this repository writes to them.

## Where to start

src/bin.ts → src/cli/usage.ts → src/cli/error-presenter.ts → src/cli/world-flag.ts → src/character/builder.ts → src/cli/boot-zone-entry.ts → src/llm/claude-adapter.ts

Read those in order to follow one run of claude-rpg end to end. This path follows claude-rpg (a command people run) from its entry, since CI runs only tests and checks.

## What this map cannot see

- 2 imports could not be resolved: `src/character/packs.test.ts` imports a path built at run time; `src/cli/terminal-ui-audit.test.ts` imports a path built at run time.
- 5 writes and 15 reads go to a path their caller passes, not to this repository.
- 3 reads go to the home directory (.claude-rpg/), not to this repository.
- 2 writes go to the directory the command is run in (.claude-rpg/), not to this repository.
- 1 command is built at run time and not followed, and it is in tests.

Regenerate with `npx --yes @dogfood-lab/atlas map`.
