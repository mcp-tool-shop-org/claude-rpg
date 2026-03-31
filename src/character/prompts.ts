// Readline prompt utilities for character creation flow

import type { Interface as ReadlineInterface } from 'node:readline';

/** Prompt for freeform text input. */
export function promptText(
  rl: ReadlineInterface,
  question: string,
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(`  ${question}: `, (answer) => {
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
