import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initOrchestratorService,
  getOrchestratorService,
  type OrchestratorAdapterConfig,
} from '@devpilot/core/orchestrator';

describe('Orchestrator Service', () => {
  let service: ReturnType<typeof getOrchestratorService>;

  beforeEach(() => {
    const config: OrchestratorAdapterConfig = {
      mode: 'disabled',
    };
    service = initOrchestratorService(config);
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('Disabled Mode', () => {
    it('should report disabled in health check', async () => {
      const health = await service.healthCheck();
      expect(health.status).toBe('down');
      expect(health.version).toBe('disabled');
    });

    it('should reject dispatch requests', async () => {
      const result = await service.dispatch({
        sessionId: 'test-session',
        repo: 'test-repo',
        taskSpec: {
          prompt: 'Test task',
          filePaths: [],
          model: 'sonnet',
        },
        callbackUrl: '',
      });
      expect(result.accepted).toBe(false);
      expect(result.error).toContain('disabled');
    });
  });

  describe('Mode Detection', () => {
    it('should report correct mode', () => {
      expect(service.mode).toBe('disabled');
      expect(service.isEnabled).toBe(false);
    });
  });
});
