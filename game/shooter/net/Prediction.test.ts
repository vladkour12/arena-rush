import { describe, it, expect } from 'vitest';
import { Prediction } from './Prediction';

describe('Prediction', () => {
  it('applies input immediately', () => {
    const p = new Prediction({ x: 100, y: 100, speed: 200, radius: 16 });
    p.applyInput({ seq: 1, mv: { x: 1, y: 0 } }, 1/30);
    const pos = p.getPosition();
    expect(pos.x).toBeGreaterThan(100);
  });

  it('reconciles to server position and re-applies later inputs', () => {
    const p = new Prediction({ x: 100, y: 100, speed: 200, radius: 16 });
    p.applyInput({ seq: 1, mv: { x: 1, y: 0 } }, 1/30);
    p.applyInput({ seq: 2, mv: { x: 1, y: 0 } }, 1/30);
    p.applyInput({ seq: 3, mv: { x: 1, y: 0 } }, 1/30);
    p.reconcile({ x: 120, y: 100, ackSeq: 2 }, 1/30);
    expect(p.getPosition().x).toBeGreaterThan(120);
    expect(p.getPosition().x).toBeLessThan(140);
  });

  it('drops inputs older than reconciled ack', () => {
    const p = new Prediction({ x: 100, y: 100, speed: 200, radius: 16 });
    p.applyInput({ seq: 1, mv: { x: 1, y: 0 } }, 1/30);
    p.reconcile({ x: 200, y: 100, ackSeq: 5 }, 1/30);
    expect(p.getPosition()).toEqual({ x: 200, y: 100 });
    p.reconcile({ x: 200, y: 100, ackSeq: 5 }, 1/30);
    expect(p.getPosition()).toEqual({ x: 200, y: 100 });
  });
});
