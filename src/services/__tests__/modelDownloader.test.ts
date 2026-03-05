/**
 * modelDownloader.test.ts
 * Unit tests for ModelDownloader behavior.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { modelDownloader } from '../modelDownloader';

// Mocking global fetch
const mockFetch = (response: Partial<Response>) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(response.headers as any || {}),
    text: () => Promise.resolve(''),
    body: {
      getReader: () => ({
        read: () => Promise.resolve({ done: true, value: undefined })
      })
    },
    ...response
  } as any);
};

describe('ModelDownloader', () => {
  let originalFetch: typeof fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('should include status code, fallback text, and body snippet on 500 error', async () => {
    mockFetch({
      ok: false,
      status: 500,
      statusText: '', // Empty status text to test fallback
      text: () => Promise.resolve('oops')
    });

    try {
      await modelDownloader.downloadModel('test-model', 'http://example.com', () => {});
      throw new Error('Should have thrown an error');
    } catch (err: any) {
      expect(err.message).toContain('500');
      expect(err.message).toContain('Internal Server Error');
      expect(err.message).toContain('oops');
    }
  });

  it('should retry on 503 with Retry-After header', async () => {
    const startTime = Date.now();
    let attempts = 0;
    
    global.fetch = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Retry-After': '1' }),
          text: () => Promise.resolve('Overloaded')
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) }
      } as any);
    });

    await modelDownloader.downloadModel('test-retry', 'http://example.com', () => {});
    
    const duration = Date.now() - startTime;
    expect(attempts).toBe(2);
    expect(duration).toBeGreaterThanOrEqual(1000);
  });

  it('should restart from 0 if Range requested but server returns 200', async () => {
    // Mock IndexedDB to show some existing progress
    vi.spyOn(modelDownloader as any, 'getDownloadedBytes').mockResolvedValue(1000);
    const deleteSpy = vi.spyOn(modelDownloader, 'deleteModel').mockResolvedValue(undefined);

    mockFetch({
      status: 200, // Server ignores Range
      headers: new Headers({ 'Content-Length': '5000' })
    });

    await modelDownloader.downloadModel('test-resume', 'http://example.com', () => {});

    expect(deleteSpy).toHaveBeenCalledWith('test-resume');
  });

  it('should never produce "<status> -" as the entire message', async () => {
    mockFetch({
      ok: false,
      status: 404,
      statusText: '',
      text: () => Promise.resolve('')
    });

    try {
      await modelDownloader.downloadModel('test-empty', 'http://example.com', () => {});
    } catch (err: any) {
      expect(err.message).not.toBe('404 -');
      expect(err.message).toContain('Not Found');
    }
  });
});
