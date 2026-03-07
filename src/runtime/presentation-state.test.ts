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
});
