// colors.ts — Semantic terminal coloring with raw ANSI escape codes.
// Respects NO_COLOR env var (https://no-color.org/) and only colors real
// terminals — output redirected to a file or piped to a non-TTY consumer
// gets plain text, matching spinner.ts's stream.isTTY branch (F-622bfe0a).

// F-c722a5ab: NO_COLOR's spec (https://no-color.org/) disables color "when
// present, regardless of its value." A bare truthiness check (`!process.env.NO_COLOR`)
// gets this wrong for `NO_COLOR=` (present but set to the empty string) --
// an empty string is falsy, so `!''` is true and color stays enabled, even
// though the var IS present. Presence, not truthiness, is what the spec
// gates on -- this happened to work by coincidence for every non-empty
// value (e.g. '0' or '1'), which is why it went unnoticed.
const enabled = (process.stdout.isTTY ?? false) && process.env.NO_COLOR === undefined;

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
