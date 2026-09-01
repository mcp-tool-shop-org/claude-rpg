// resume-path.test.ts — WO-A4-7 (slice A4 design doc §4, ADDENDUM-COMMON lock 5)
import { describe, it, expect } from 'vitest';
import { decideResumePath } from './resume-path.js';

describe('decideResumePath (WO-A4-7)', () => {
  it('picks the pack branch when packId is present, regardless of worldGenProposal', () => {
    const decision = decideResumePath({ packId: 'starter-fantasy', worldGenProposal: '{}' });
    expect(decision).toEqual({ kind: 'pack', packId: 'starter-fantasy' });
  });

  it('picks the generated branch when packId is absent but worldGenProposal is present', () => {
    const decision = decideResumePath({ worldGenProposal: '{"title":"Test"}', worldSeed: 4242 });
    expect(decision).toEqual({ kind: 'generated', proposalJson: '{"title":"Test"}', seed: 4242 });
  });

  it('carries an undefined seed through unchanged (a legitimate case -- proposal without a captured seed)', () => {
    const decision = decideResumePath({ worldGenProposal: '{"title":"Test"}' });
    expect(decision).toEqual({ kind: 'generated', proposalJson: '{"title":"Test"}', seed: undefined });
  });

  it('refuses when neither packId nor worldGenProposal is present', () => {
    const decision = decideResumePath({});
    expect(decision).toEqual({ kind: 'refuse' });
  });

  it('refuses when packId is an empty string (falsy) and worldGenProposal is absent', () => {
    const decision = decideResumePath({ packId: '' });
    expect(decision).toEqual({ kind: 'refuse' });
  });
});
