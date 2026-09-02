import { describe, it, expect } from 'vitest';
import { filterHints, type HintLedger, type Hintable } from './hint-ledger.js';

const HINT: Hintable = { text: 'Try /market for the black market.', trigger: 'black-market' };

describe('filterHints', () => {
  it('lets a never-fired hint through and records its first firing', () => {
    const { kept, ledger } = filterHints([HINT], {}, 10, 'town-square');
    expect(kept).toEqual([HINT]);
    expect(ledger['black-market']).toEqual({ fires: 1, lastTick: 10, armedBy: 'town-square' });
  });

  it('fires a second time once the cooldown has elapsed', () => {
    const ledger: HintLedger = { 'black-market': { fires: 1, lastTick: 10, armedBy: 'town-square' } };
    const { kept, ledger: next } = filterHints([HINT], ledger, 30, 'town-square');
    expect(kept).toEqual([HINT]);
    expect(next['black-market']).toEqual({ fires: 2, lastTick: 30, armedBy: 'town-square' });
  });

  it('withholds a second firing before the cooldown elapses', () => {
    const ledger: HintLedger = { 'black-market': { fires: 1, lastTick: 10, armedBy: 'town-square' } };
    const { kept, ledger: next } = filterHints([HINT], ledger, 15, 'town-square');
    expect(kept).toEqual([]);
    expect(next['black-market']).toEqual({ fires: 1, lastTick: 10, armedBy: 'town-square' }); // unchanged
  });

  it('retires a hint permanently after 2 firings under the same state token', () => {
    const ledger: HintLedger = { 'black-market': { fires: 2, lastTick: 30, armedBy: 'town-square' } };
    const { kept } = filterHints([HINT], ledger, 100, 'town-square');
    expect(kept).toEqual([]);
  });

  it('re-arms a retired hint on a state change, allowing it to fire again immediately', () => {
    const ledger: HintLedger = { 'black-market': { fires: 2, lastTick: 30, armedBy: 'town-square' } };
    const { kept, ledger: next } = filterHints([HINT], ledger, 31, 'market-district'); // new district, cooldown not elapsed
    expect(kept).toEqual([HINT]);
    expect(next['black-market']).toEqual({ fires: 1, lastTick: 31, armedBy: 'market-district' });
  });

  it('handles multiple independent causes without cross-contamination', () => {
    const other: Hintable = { text: 'Accept the open contract.', trigger: 'opportunity-open' };
    const ledger: HintLedger = { 'black-market': { fires: 2, lastTick: 5, armedBy: 'x' } };
    const { kept, ledger: next } = filterHints([HINT, other], ledger, 6, 'x');
    expect(kept).toEqual([other]);
    expect(next['black-market']).toEqual({ fires: 2, lastTick: 5, armedBy: 'x' });
    expect(next['opportunity-open']).toEqual({ fires: 1, lastTick: 6, armedBy: 'x' });
  });
});
