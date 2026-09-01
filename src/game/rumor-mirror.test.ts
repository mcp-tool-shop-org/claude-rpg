import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RumorEngine } from '@ai-rpg-engine/rumor-system';
import type { PlayerRumor, RumorValence } from '@ai-rpg-engine/modules';
import { chargeOf, mirrorPlayerRumor } from './rumor-mirror.js';

/**
 * WO-A3-3: derive the installed dist's actual `RumorValence` union members
 * by reading the .d.ts text directly (a type-level union has no runtime
 * representation to iterate) and regex-extracting the declared literal
 * union — so a future engine valence addition that `chargeOf` doesn't
 * cover goes red here instead of silently mapping to `undefined` charge at
 * runtime. This is the SAME file the doc comment in rumor-mirror.ts cites.
 *
 * `@ai-rpg-engine/modules`'s package.json "exports" map has no "require"
 * condition (ESM-only) and no "./package.json" subpath — both
 * `import.meta.resolve` (not implemented by Vitest's SSR loader here) and
 * `createRequire(...).resolve` (fails with "No exports main defined") are
 * unusable. This walks up from THIS test file's own directory the same way
 * Node's module resolution algorithm would, looking for
 * `node_modules/@ai-rpg-engine/modules/dist/player-rumor.d.ts` — which is
 * exactly how this worktree resolves the package at all (no local
 * node_modules; run through the main repo's install per the wave's
 * worktree-provisioning note).
 */
function findInstalledPlayerRumorDts(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 20; i++) {
    const candidate = join(dir, 'node_modules', '@ai-rpg-engine', 'modules', 'dist', 'player-rumor.d.ts');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate an installed @ai-rpg-engine/modules/dist/player-rumor.d.ts by walking up from ' + import.meta.url);
}

function readInstalledValenceMembers(): string[] {
  const text = readFileSync(findInstalledPlayerRumorDts(), 'utf-8');
  const match = text.match(/export type RumorValence = ([^;]+);/);
  if (!match) {
    throw new Error('Could not find `export type RumorValence = ...;` in the installed player-rumor.d.ts — the dist shape moved.');
  }
  return match[1].split('|').map((s) => s.trim().replace(/^'|'$/g, ''));
}

describe('chargeOf (WO-A3-3) — exhaustive over the installed dist\'s RumorValence union', () => {
  it('the installed dist\'s RumorValence union is exactly the four members this repo already assumes', () => {
    // Pinned expectation: if @ai-rpg-engine/modules ships a new/renamed
    // valence, this assertion goes red FIRST, before any downstream
    // chargeOf gap could silently produce undefined charge.
    expect(readInstalledValenceMembers().sort()).toEqual(
      ['fearsome', 'heroic', 'mysterious', 'tragic'].sort(),
    );
  });

  it('chargeOf returns a finite number for every member of the installed union', () => {
    const members = readInstalledValenceMembers() as RumorValence[];
    expect(members.length).toBeGreaterThan(0);
    for (const valence of members) {
      const charge = chargeOf(valence);
      expect(typeof charge).toBe('number');
      expect(Number.isFinite(charge)).toBe(true);
      expect(charge).toBeGreaterThanOrEqual(-1);
      expect(charge).toBeLessThanOrEqual(1);
    }
  });

  it('maps heroic positive, fearsome/tragic negative, mysterious neutral', () => {
    expect(chargeOf('heroic')).toBeGreaterThan(0);
    expect(chargeOf('fearsome')).toBeLessThan(0);
    expect(chargeOf('tragic')).toBeLessThan(0);
    expect(chargeOf('mysterious')).toBe(0);
  });
});

function makeRumor(overrides: Partial<PlayerRumor> = {}): PlayerRumor {
  return {
    id: 'r1',
    claim: 'defeated the Bone Collector',
    subjectDescriptor: 'a grim wanderer',
    sourceEvent: 'milestone',
    confidence: 0.8,
    distortion: 0,
    mutationCount: 0,
    valence: 'heroic',
    spreadTo: [],
    originTick: 3,
    ...overrides,
  };
}

describe('mirrorPlayerRumor (WO-A3-2)', () => {
  it('creates a RumorEngine rumor keyed by the ledger rumor id, subject "player"', () => {
    const engine = new RumorEngine({ stanceFadeTicks: 24 });
    const rumor = makeRumor({ id: 'ledger-1', originFactionId: 'guild-a' });

    mirrorPlayerRumor(engine, rumor);

    const mirrored = engine.findBySubjectKey('player', 'ledger-1');
    expect(mirrored).toBeDefined();
    expect(mirrored?.claim).toBe(rumor.claim);
    expect(mirrored?.sourceId).toBe('guild-a');
    expect(mirrored?.originTick).toBe(3);
    expect(mirrored?.confidence).toBe(0.8);
    expect(mirrored?.emotionalCharge).toBe(0.6);
  });

  it('falls back to sourceId "world" when the ledger rumor has no originFactionId', () => {
    const engine = new RumorEngine({ stanceFadeTicks: 24 });
    const rumor = makeRumor({ id: 'ledger-2', originFactionId: undefined });

    mirrorPlayerRumor(engine, rumor);

    expect(engine.findBySubjectKey('player', 'ledger-2')?.sourceId).toBe('world');
  });

  it('records faction uptake against the ENGINE-generated id, not the ledger rumor id, when originFactionId is present', () => {
    const engine = new RumorEngine({ stanceFadeTicks: 24 });
    const rumor = makeRumor({ id: 'ledger-3', originFactionId: 'guild-b' });

    mirrorPlayerRumor(engine, rumor);

    const mirrored = engine.findBySubjectKey('player', 'ledger-3');
    expect(mirrored?.factionUptake).toContain('guild-b');
  });

  it('is idempotent: mirroring the same ledger rumor id twice does not create a sibling', () => {
    const engine = new RumorEngine({ stanceFadeTicks: 24 });
    const rumor = makeRumor({ id: 'ledger-4' });

    mirrorPlayerRumor(engine, rumor);
    mirrorPlayerRumor(engine, rumor);

    expect(engine.query({ subject: 'player' })).toHaveLength(1);
  });
});
