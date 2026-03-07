import { describe, it, expect } from 'vitest';
import { createGame } from '@ai-rpg-engine/starter-fantasy';
import { GameSession } from './game.js';

describe('GameSession', () => {
  it('should create a session with a starter world', () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      tone: 'dark fantasy',
      clientConfig: { apiKey: 'test-key' },
    });

    expect(session.engine).toBe(engine);
    expect(session.title).toBe('Test Game');
    expect(session.tone).toBe('dark fantasy');
    expect(session.mode).toBe('play');
  });

  it('should return welcome text', () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });

    const welcome = session.getWelcome();
    expect(welcome).toContain('Test Game');
    expect(welcome).toContain('/director');
  });

  it('should switch to director mode', async () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });

    const output = await session.processInput('/director');
    expect(output).toContain('DIRECTOR MODE');
    expect(session.mode).toBe('director');
  });

  it('should handle quit command', async () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });

    const output = await session.processInput('quit');
    expect(output).toBe('__QUIT__');
  });

  it('should execute director commands', async () => {
    const engine = createGame();
    const session = new GameSession({
      engine,
      title: 'Test Game',
      clientConfig: { apiKey: 'test-key' },
    });

    // Switch to director mode
    await session.processInput('/director');

    // Inspect pilgrim
    const output = await session.processInput('/inspect pilgrim');
    expect(output).toBeTruthy();
  });
});
