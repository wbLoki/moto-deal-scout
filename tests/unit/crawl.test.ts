import { describe, expect, it, vi } from 'vitest';
import { crawlPages } from '../../src/infrastructure/sources/shared/crawl.js';
import { makeListing } from '../fixtures/sampleData.js';

const page = (...ids: string[]) => ids.map((externalId) => makeListing({ externalId }));

const WATERMARK = new Date('2026-01-10T00:00:00Z');
const OLD = new Date('2026-01-05T00:00:00Z');
const NEW = new Date('2026-01-20T00:00:00Z');
/** A listing with an explicit post date, for the incremental-watermark tests. */
const dated = (externalId: string, postedAt: Date | undefined) =>
  makeListing({ externalId, postedAt });

describe('crawlPages', () => {
  it('walks pages until maxPages, collecting everything new', async () => {
    const fetchPage = vi
      .fn<(n: number) => Promise<ReturnType<typeof page>>>()
      .mockResolvedValueOnce(page('a', 'b'))
      .mockResolvedValueOnce(page('c', 'd'))
      .mockResolvedValueOnce(page('e', 'f'));

    const out = await crawlPages({ maxPages: 3, throttleMs: 0, fetchPage });
    expect(out.map((l) => l.externalId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('stops once a page contributes nothing new, not when it is empty', async () => {
    // Avito pins the same sponsored ads to the top of every page and, past
    // the last real page, serves only those. So the end signal has to be
    // "no new ids", not "no ids" — otherwise the crawl runs to maxPages.
    const fetchPage = vi
      .fn<(n: number) => Promise<ReturnType<typeof page>>>()
      .mockResolvedValueOnce(page('pin1', 'pin2', 'a'))
      .mockResolvedValueOnce(page('pin1', 'pin2', 'b'))
      .mockResolvedValueOnce(page('pin1', 'pin2'))
      .mockResolvedValue(page('pin1', 'pin2'));

    const out = await crawlPages({ maxPages: 20, throttleMs: 0, fetchPage });
    expect(out.map((l) => l.externalId)).toEqual(['pin1', 'pin2', 'a', 'b']);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('deduplicates ads repeated across pages', async () => {
    const fetchPage = vi
      .fn<(n: number) => Promise<ReturnType<typeof page>>>()
      .mockResolvedValueOnce(page('a', 'b', 'a'))
      .mockResolvedValueOnce(page('b', 'c'))
      .mockResolvedValue([]);

    const out = await crawlPages({ maxPages: 5, throttleMs: 0, fetchPage });
    expect(out.map((l) => l.externalId)).toEqual(['a', 'b', 'c']);
  });

  it('retries a page that fails once, then carries on', async () => {
    // A single stalled page shouldn't cost us the rest of a 40-page crawl.
    const fetchPage = vi
      .fn<(n: number) => Promise<ReturnType<typeof page>>>()
      .mockResolvedValueOnce(page('a'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(page('b'))
      .mockResolvedValue([]);
    const onError = vi.fn();

    const out = await crawlPages({ maxPages: 5, throttleMs: 0, fetchPage, onError });
    expect(out.map((l) => l.externalId)).toEqual(['a', 'b']);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps what it collected when every attempt at a page fails', async () => {
    const boom = new Error('timeout');
    const fetchPage = vi
      .fn<(n: number) => Promise<ReturnType<typeof page>>>()
      .mockResolvedValueOnce(page('a'))
      .mockRejectedValue(boom);
    const onError = vi.fn();

    const out = await crawlPages({ maxPages: 5, throttleMs: 0, fetchPage, onError, retries: 1 });
    expect(out.map((l) => l.externalId)).toEqual(['a']);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith(boom, 2);
  });

  describe('incremental crawl (postedAfter watermark)', () => {
    it('stops once a whole page is older than the watermark, keeping the recent ones', async () => {
      const fetchPage = vi
        .fn<(n: number) => Promise<ReturnType<typeof page>>>()
        .mockResolvedValueOnce([dated('new1', NEW), dated('new2', NEW)])
        .mockResolvedValueOnce([dated('old1', OLD), dated('old2', OLD)])
        .mockResolvedValue([dated('old3', OLD)]);

      const out = await crawlPages({ maxPages: 10, throttleMs: 0, fetchPage, postedAfter: WATERMARK });
      expect(out.map((l) => l.externalId)).toEqual(['new1', 'new2']);
      // Page 2 is fetched to discover it's all old, then the crawl stops.
      expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('is not truncated by a single old ad pinned to the top of every page', async () => {
      // Avito pins old sponsored ads; one old card must not end the crawl while
      // fresh listings still sit below it.
      const fetchPage = vi
        .fn<(n: number) => Promise<ReturnType<typeof page>>>()
        .mockResolvedValueOnce([dated('pin', OLD), dated('new1', NEW), dated('new2', NEW)])
        .mockResolvedValueOnce([dated('pin', OLD), dated('new3', NEW)])
        .mockResolvedValue([dated('pin', OLD), dated('tail', OLD)]);

      const out = await crawlPages({ maxPages: 10, throttleMs: 0, fetchPage, postedAfter: WATERMARK });
      expect(out.map((l) => l.externalId)).toEqual(['new1', 'new2', 'new3']);
    });

    it('never trims listings that carry no post date (e.g. Biker cards)', async () => {
      const fetchPage = vi
        .fn<(n: number) => Promise<ReturnType<typeof page>>>()
        .mockResolvedValueOnce([dated('a', undefined), dated('b', undefined)])
        .mockResolvedValueOnce([dated('c', undefined)])
        .mockResolvedValue([]);

      const out = await crawlPages({ maxPages: 10, throttleMs: 0, fetchPage, postedAfter: WATERMARK });
      expect(out.map((l) => l.externalId)).toEqual(['a', 'b', 'c']);
    });
  });
});
