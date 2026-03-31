// colors.ts — Semantic terminal coloring with raw ANSI escape codes.
// Respects NO_COLOR env var (https://no-color.org/).

const enabled = !process.env.NO_COLOR;

const ESC = '\x1b[';
const RESET = `${ESC}0m`;

function wrap(code: string, text: string): string {
  if (!enabled) return text;
  return `${ESC}${code}m${text}${RESET}`;
}

// Base styles
export const bold = (t: string): string => wrap('1', t);
export const dim = (t: string): string => wrap('2', t);
export const italic = (t: string): string => wrap('3', t);

// Semantic colors
export const red = (t: string): string => wrap('31', t);
export const green = (t: string): string => wrap('32', t);
export const yellow = (t: string): string => wrap('33', t);
export const cyan = (t: string): string => wrap('36', t);
export const white = (t: string): string => wrap('37', t);

// Semantic composites
/** Character names, NPC dialogue headers */
export const speaker = (t: string): string => bold(t);
/** Dividers and secondary text */
export const secondary = (t: string): string => dim(t);
/** Warnings, threats, combat */
export const danger = (t: string): string => wrap('1', wrap('33', t)); // bold yellow
/** Critical danger / death */
export const critical = (t: string): string => wrap('1', wrap('31', t)); // bold red
/** Level-ups, positive changes, healing */
export const positive = (t: string): string => green(t);
/** Hints, suggestions, system messages */
export const hint = (t: string): string => cyan(t);

/** Check if color output is enabled. */
export function isColorEnabled(): boolean {
  return enabled;
}
