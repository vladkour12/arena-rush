import { describe, it, expect } from 'vitest';
import { MSG } from './protocol.js';

describe('shooter protocol', () => {
  it('exports all required client→server message types', () => {
    expect(MSG.INPUT).toBe('INPUT');
    expect(MSG.JOIN_MATCH).toBe('JOIN_MATCH');
    expect(MSG.LEAVE_MATCH).toBe('LEAVE_MATCH');
    expect(MSG.REMATCH_REQUEST).toBe('REMATCH_REQUEST');
  });
  it('exports all required server→client message types', () => {
    expect(MSG.SNAP).toBe('SNAP');
    expect(MSG.KILL).toBe('KILL');
    expect(MSG.PICKUP).toBe('PICKUP');
    expect(MSG.MATCH_START).toBe('MATCH_START');
    expect(MSG.MATCH_END).toBe('MATCH_END');
    expect(MSG.RESPAWN).toBe('RESPAWN');
  });
});
