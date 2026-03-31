import { describe, it, expect } from 'vitest';
import { PresentationStateMachine } from './presentation-state.js';

describe('PresentationStateMachine', () => {
  it('should start in exploration state', () => {
    const sm = new PresentationStateMachine();
    expect(sm.current).toBe('exploration');
  });

  it('should transition between states', () => {
    const sm = new PresentationStateMachine();
    const t = sm.transition('combat', 'attack');
    expect(t.from).toBe('exploration');
    expect(t.to).toBe('combat');
    expect(sm.current).toBe('combat');
  });

  it('should add music shift on combat transition', () => {
    const sm = new PresentationStateMachine();
    const t = sm.transition('combat', 'attack');
    expect(t.musicShift).toBeDefined();
    expect(t.musicShift!.action).toBe('intensify');
  });

  it('should add ambient shift on combat transition', () => {
    const sm = new PresentationStateMachine();
    const t = sm.transition('combat', 'attack');
    expect(t.ambientShift).toBeDefined();
    expect(t.ambientShift!.length).toBeGreaterThan(0);
  });

  it('should soften music on aftermath', () => {
    const sm = new PresentationStateMachine();
    sm.transition('combat', 'attack');
    const t = sm.transition('aftermath', 'defeat');
    expect(t.musicShift?.action).toBe('soften');
  });

  it('should infer combat from combat events', () => {
    const sm = new PresentationStateMachine();
    const events = [{ type: 'combat.contact.hit', tick: 1, payload: {} }] as any;
    const state = sm.inferFromEvents(events);
    expect(state).toBe('combat');
  });

  it('should infer dialogue from speak verb', () => {
    const sm = new PresentationStateMachine();
    const state = sm.inferFromEvents([], 'speak');
    expect(state).toBe('dialogue');
  });

  it('should infer exploration from zone change', () => {
    const sm = new PresentationStateMachine();
    const events = [{ type: 'world.zone.entered', tick: 1, payload: {} }] as any;
    const state = sm.inferFromEvents(events);
    expect(state).toBe('exploration');
  });

  it('should call transition listeners', () => {
    const sm = new PresentationStateMachine();
    const transitions: string[] = [];
    sm.onTransition((t) => transitions.push(`${t.from}->${t.to}`));
    sm.transition('combat', 'attack');
    sm.transition('aftermath', 'defeat');
    expect(transitions).toEqual(['exploration->combat', 'combat->aftermath']);
  });

  it('should countdown aftermath turns then return to exploration (T-010)', () => {
    const sm = new PresentationStateMachine();

    // Trigger aftermath via combat defeat event
    const defeatEvents = [
      { type: 'combat.entity.defeated', tick: 1, payload: {} },
    ] as any;
    const state1 = sm.inferFromEvents(defeatEvents, undefined, 1);
    expect(state1).toBe('aftermath');

    // First call with no events: aftermathTurns was 2, decrements to 1 → still aftermath
    const state2 = sm.inferFromEvents([], undefined, 2);
    expect(state2).toBe('aftermath');

    // Second call with no events: aftermathTurns was 1, decrements to 0 → exploration
    const state3 = sm.inferFromEvents([], undefined, 3);
    expect(state3).toBe('exploration');

    // Third call: aftermath fully expired, stays exploration
    const state4 = sm.inferFromEvents([], undefined, 4);
    expect(state4).toBe('exploration');
  });

  it('should not double-decrement aftermathTurns when called twice with the same tick', () => {
    const sm = new PresentationStateMachine();

    // Trigger aftermath via combat defeat (sets aftermathTurns = 2)
    const defeatEvents = [
      { type: 'combat.entity.defeated', tick: 1, payload: {} },
    ] as any;
    sm.inferFromEvents(defeatEvents, undefined, 1);

    // Call twice with tick=2 — should only decrement once
    const state2a = sm.inferFromEvents([], undefined, 2);
    expect(state2a).toBe('aftermath'); // 2 → 1
    const state2b = sm.inferFromEvents([], undefined, 2);
    expect(state2b).toBe('aftermath'); // still 1, no double-decrement

    // tick=3 decrements to 0 → exploration
    const state3 = sm.inferFromEvents([], undefined, 3);
    expect(state3).toBe('exploration');
  });

  it('should infer exploration from zone change even when starting in combat (T-011)', () => {
    const sm = new PresentationStateMachine();

    // First transition to combat
    sm.transition('combat', 'attack');
    expect(sm.current).toBe('combat');

    // Now infer from zone change events — should return exploration
    const zoneEvents = [
      { type: 'world.zone.entered', tick: 2, payload: {} },
    ] as any;
    const state = sm.inferFromEvents(zoneEvents);
    expect(state).toBe('exploration');
  });
});
