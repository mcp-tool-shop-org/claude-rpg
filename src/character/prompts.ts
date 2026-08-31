// Readline prompt utilities for character creation flow

import type { Interface as ReadlineInterface } from 'node:readline';
import { getTerminalWidth } from '../display/play-renderer.js';
import { bold } from '../cli/colors.js';

/**
 * F-f480fef1: the single recognized cancel keyword, checked case-insensitively
 * against every trimmed promptText answer (see promptText below, the one
 * choke point every helper in this file awaits for its raw input). "cancel"
 * over "back" -- the finding names either -- because this implements one
 * full abort out of the flow, not per-step back-navigation to the previous
 * prompt; "back" would over-promise the latter.
 */
export const CANCEL_KEYWORD = 'cancel';

/**
 * F-f480fef1: thrown by promptText when the player types CANCEL_KEYWORD
 * instead of answering. Before this fix, builder.ts's buildCharacter (the
 * only consumer of this file) chained promptText/promptMenu/promptConfirm/
 * promptMultiSelect/promptGroupedMenu across ~7 linear steps with no way to
 * back out to the caller short of Ctrl+C -- which, per F-4997779f, hits
 * Node's raw default SIGINT disposition during this exact window (immediate
 * termination, exit 130, no "Farewell." message), since the graceful
 * first-Ctrl+C-saves handler isn't registered until runGameLoop() starts,
 * well after character creation completes. buildCharacter catches this
 * specifically, prints `.message` as a clean confirmation, and rethrows it
 * unchanged so its own caller (bin.ts's runPlay, outside this domain's
 * globs) can define what happens next -- the same typed-error contract
 * cli/error-presenter.ts already uses for NarrationError/SaveLoadError, not
 * yet added to that switch (a cross-domain follow-up; unmodified, an
 * uncaught PromptCancelled still falls through to bin.ts's generic
 * unhandledRejection handler, which exits(1) with a generic box -- a known,
 * documented gap, not a silent one).
 */
export class PromptCancelled extends Error {
  constructor() {
    super('Character creation cancelled. No character was created.');
    this.name = 'PromptCancelled';
  }
}

/** Prompt for freeform text input. */
export function promptText(
  rl: ReadlineInterface,
  question: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // F-3a8ccf9c: if stdin ends while this question is pending (piped input
    // running out, or a non-interactive/scripted invocation reaching EOF
    // without answering), rl.question's callback never fires -- the
    // interface is already closed -- so the returned Promise would hang
    // forever. Reject on 'close' instead (PFE-001 pattern, mirroring
    // bin.ts's own question() helper) so every awaiter up the chain
    // (promptMenu's retry loop, promptMultiSelect, promptConfirm, and
    // ultimately builder.ts's buildCharacter flow) surfaces a catchable
    // error instead of hanging silently. The listener is removed once the
    // question settles normally so a long, multi-prompt flow like character
    // creation doesn't accumulate 'close' listeners on the shared rl.
    const onClose = () => reject(new Error('input closed before answering'));
    rl.once('close', onClose);
    rl.question(`  ${question}: `, (answer) => {
      rl.off('close', onClose);
      const trimmed = answer.trim();
      // F-f480fef1: single choke point for the cancel keyword -- every
      // helper in this file (promptMenu, promptConfirm, promptMultiSelect,
      // promptGroupedMenu) awaits promptText for its raw input, so checking
      // here covers all five without touching each one individually.
      if (trimmed.toLowerCase() === CANCEL_KEYWORD) {
        reject(new PromptCancelled());
        return;
      }
      resolve(trimmed);
    });
  });
}

/** Display a numbered menu and return the selected index. */
export async function promptMenu(
  rl: ReadlineInterface,
  title: string,
  items: Array<{ label: string; description?: string }>,
): Promise<number> {
  console.log(`\n  ${title}\n`);
  // F-5f8defa0: rows used to print as a single unwrapped `    N. label — desc`
  // string with no width-aware wrap, unlike this file's own promptGroupedMenu
  // (below), which already routes every row through wrapMenuLine() at
  // getTerminalWidth()-4 with a hanging indent. builder.ts calls this for
  // archetype/background/discipline (3 of 7 character-creation steps every
  // new player goes through) -- same row shape as the world-select menu that
  // already got this fix, so it gets the same treatment.
  for (let i = 0; i < items.length; i++) {
    const desc = items[i].description ? ` — ${items[i].description}` : '';
    for (const rowLine of wrapMenuLine(`${i + 1}. ${items[i].label}${desc}`)) {
      console.log(`    ${rowLine}`);
    }
  }
  console.log('');

  while (true) {
    const answer = await promptText(rl, `Choose (1-${items.length})`);
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= items.length) {
      return num - 1;
    }
    console.log(`  Please enter a number between 1 and ${items.length}.`);
  }
}

/** Yes/no confirmation. */
export async function promptConfirm(
  rl: ReadlineInterface,
  question: string,
): Promise<boolean> {
  const answer = await promptText(rl, `${question} (y/n)`);
  return answer.toLowerCase().startsWith('y');
}

/** Multi-select from a list, returns selected indices. */
export async function promptMultiSelect(
  rl: ReadlineInterface,
  title: string,
  items: Array<{ label: string; description?: string }>,
  maxSelections: number,
): Promise<number[]> {
  console.log(`\n  ${title} (pick up to ${maxSelections})\n`);
  // F-5f8defa0: same fix as promptMenu above -- route rows through
  // wrapMenuLine() instead of a raw unwrapped `    N. label — desc` string.
  for (let i = 0; i < items.length; i++) {
    const desc = items[i].description ? ` — ${items[i].description}` : '';
    for (const rowLine of wrapMenuLine(`${i + 1}. ${items[i].label}${desc}`)) {
      console.log(`    ${rowLine}`);
    }
  }
  console.log('');

  // Zero selections is a valid outcome: the loop exits when maxSelections is reached
  // or the user types "done" (only after at least 1 selection). If maxSelections is 0,
  // the loop body never executes and an empty array is returned intentionally.
  const selected: number[] = [];
  while (selected.length < maxSelections) {
    const remaining = maxSelections - selected.length;
    const answer = await promptText(
      rl,
      `Choose (1-${items.length}, or "done")${remaining < maxSelections ? ` [${selected.length} selected]` : ''}`,
    );
    const isDone = answer.toLowerCase() === 'done';
    if (isDone && selected.length > 0) break;
    // F-0d1f3d37: typing "done" before selecting anything used to fall
    // through to parseInt('done', 10) = NaN, fail the range check below, and
    // hit no other branch -- the loop silently re-printed the identical
    // prompt with no acknowledgment "done" requires at least one selection
    // first.
    if (isDone) {
      console.log(`  Pick at least one before typing "done".`);
      continue;
    }

    const num = parseInt(answer, 10);
    if (num >= 1 && num <= items.length) {
      const idx = num - 1;
      if (selected.includes(idx)) {
        console.log(`  Already selected. Pick another or type "done".`);
      } else {
        selected.push(idx);
        console.log(`  Selected: ${items[idx].label}`);
      }
    } else {
      // F-0d1f3d37: any other non-numeric or out-of-range answer (a typo, an
      // accidental keystroke) used to hit no branch at all -- unlike this
      // file's own promptMenu/promptGroupedMenu, which both print a
      // please-enter-a-number-in-range message on any rejection.
      console.log(`  Please enter a number between 1 and ${items.length}, or type "done".`);
    }
  }
  return selected;
}

/**
 * F-6ed5f350 (SLATE-3): one non-selectable group-label header, plus the
 * items under it.
 */
export type MenuGroup<T> = {
  label: string;
  items: Array<{ item: T; label: string; description?: string }>;
};

/**
 * Wrap a single menu row to the terminal width with a hanging indent for
 * continuation lines, so a long label+description doesn't overflow raw into
 * a narrow terminal. Exported for direct testing.
 *
 * F-6ed5f350: neither this file nor builder.ts imported cli/colors.ts or a
 * terminal-width helper before this fix — a pre-existing, previously
 * unreported gap in this domain (not unique to the new grouped menu).
 * `-4` accounts for the 4-space indent every in-file caller prints each row
 * with (originally just promptGroupedMenu; F-5f8defa0 brought promptMenu and
 * promptMultiSelect's rows into the same convention); a caller passing a
 * differently-indented line would need its own budget, but every caller in
 * this file uses that one same 4-space shape.
 */
export function wrapMenuLine(line: string): string[] {
  const width = Math.max(20, getTerminalWidth() - 4);
  if (line.length <= width) return [line];

  const words = line.split(' ');
  const wrapped: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width && current) {
      wrapped.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) wrapped.push(current);

  // Hanging indent: every continuation line gets 2 extra spaces so it reads
  // as a continuation of the numbered first line, not a new sibling row.
  return wrapped.map((l, i) => (i === 0 ? l : `  ${l}`));
}

/**
 * Grouped variant of promptMenu — renders items under non-selectable
 * group-label headers (e.g. difficulty tiers) while keeping ONE continuous
 * flat 1..N numbering across every group, so "pick number 7" never depends
 * on which group it visually sits in. Returns the selected item T directly
 * (not a flattened index), so callers never have to map a display-order
 * index back to their own original ordering.
 *
 * F-6ed5f350 (SLATE-3): group headers are bolded (a no-op under
 * NO_COLOR/non-TTY, per colors.ts's own `enabled` gate) and long rows wrap
 * with a hanging indent at getTerminalWidth() (see wrapMenuLine above)
 * instead of overflowing raw into the terminal.
 */
export async function promptGroupedMenu<T>(
  rl: ReadlineInterface,
  title: string,
  groups: MenuGroup<T>[],
): Promise<T> {
  console.log(`\n  ${title}\n`);

  const flatItems: Array<{ item: T; label: string; description?: string }> = [];
  for (const group of groups) {
    if (group.items.length === 0) continue;
    console.log(`  ${bold(group.label)}`);
    for (const entry of group.items) {
      flatItems.push(entry);
      const num = flatItems.length;
      const desc = entry.description ? ` — ${entry.description}` : '';
      const rowLines = wrapMenuLine(`${num}. ${entry.label}${desc}`);
      for (const rowLine of rowLines) {
        console.log(`    ${rowLine}`);
      }
    }
    console.log('');
  }

  while (true) {
    const answer = await promptText(rl, `Choose (1-${flatItems.length})`);
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= flatItems.length) {
      return flatItems[num - 1].item;
    }
    console.log(`  Please enter a number between 1 and ${flatItems.length}.`);
  }
}
