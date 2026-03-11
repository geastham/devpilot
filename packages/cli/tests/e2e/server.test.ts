import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/server';
import type { FastifyInstance } from 'fastify';

describe('DevPilot Server E2E', () => {
  let app: FastifyInstance;
  const testPort = 4999;

  beforeAll(async () => {
    app = await createServer({
      port: testPort,
      dbPath: ':memory:',
    });
    await app.listen({ port: testPort, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await fetch(`http://127.0.0.1:${testPort}/api/health`);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
    });
  });

  describe('Items API', () => {
    it('should create and retrieve an item', async () => {
      // Create item
      const createRes = await fetch(`http://127.0.0.1:${testPort}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Item',
          repo: 'test-repo',
          zone: 'SHAPING',
        }),
      });
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created.title).toBe('Test Item');

      // Get items
      const getRes = await fetch(`http://127.0.0.1:${testPort}/api/items`);
      const items = await getRes.json();
      expect(items.length).toBeGreaterThan(0);
      expect(items.some((i: any) => i.id === created.id)).toBe(true);
    });
  });

  describe('Fleet API', () => {
    it('should return fleet state', async () => {
      const response = await fetch(`http://127.0.0.1:${testPort}/api/fleet/state`);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('sessions');
      expect(data).toHaveProperty('runway');
      expect(data).toHaveProperty('fleet');
    });
  });

  describe('Score API', () => {
    it('should return conductor score', async () => {
      const response = await fetch(`http://127.0.0.1:${testPort}/api/score`);
      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('score');
    });
  });
});
