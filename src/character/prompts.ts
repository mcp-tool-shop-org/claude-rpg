// Readline prompt utilities for character creation flow

import type { Interface as ReadlineInterface } from 'node:readline';
import { getTerminalWidth } from '../display/play-renderer.js';
import { bold } from '../cli/colors.js';

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
      resolve(answer.trim());
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
  for (let i = 0; i < items.length; i++) {
    const desc = items[i].description ? ` — ${items[i].description}` : '';
    console.log(`    ${i + 1}. ${items[i].label}${desc}`);
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
  for (let i = 0; i < items.length; i++) {
    const desc = items[i].description ? ` — ${items[i].description}` : '';
    console.log(`    ${i + 1}. ${items[i].label}${desc}`);
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
    if (answer.toLowerCase() === 'done' && selected.length > 0) break;

    const num = parseInt(answer, 10);
    if (num >= 1 && num <= items.length) {
      const idx = num - 1;
      if (selected.includes(idx)) {
        console.log(`  Already selected. Pick another or type "done".`);
      } else {
        selected.push(idx);
        console.log(`  Selected: ${items[idx].label}`);
      }
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
 * `-4` accounts for the 4-space indent promptGroupedMenu prints each row
 * with; a wider caller passing a differently-indented line would need its
 * own budget, but this file only ever calls it that one way.
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
