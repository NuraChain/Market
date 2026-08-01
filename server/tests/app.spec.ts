import { describe, it, expect } from 'vitest';

import { buildApp } from '../src/app.ts';
import { MARKETS, POSITIONS } from '../src/data.ts';
import type { LeaderboardRow, Market, PortfolioSummary, Series } from '../src/schemas.ts';

const app = buildApp({ dev: false });
const get = (path: string): Promise<Response> => app.handle(new Request(`http://local${ path }`));

describe('auctionhouse api', () =>
{
    it('answers the health probe', async () =>
    {
        const response = await get('/api/healthz');
        expect(response.status).toBe(200);
        expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
    });

    it('lists every seeded market, bilingual and priced', async () =>
    {
        const response = await get('/api/markets');
        expect(response.status).toBe(200);
        const markets = (await response.json()) as Market[];
        expect(markets.length).toBe(MARKETS.length);
        for (const entry of markets)
        {
            expect(entry.title.en.length).toBeGreaterThan(0);
            expect(entry.title.fa.length).toBeGreaterThan(0);
            for (const outcome of entry.outcomes)
            {
                expect(outcome.price).toBeGreaterThan(0);
                expect(outcome.price).toBeLessThan(1);
            }
        }
    });

    it('serves one market by id and 404s an unknown one', async () =>
    {
        const found = await get('/api/markets/btc-150k-2026');
        expect(found.status).toBe(200);
        expect(((await found.json()) as Market).category).toBe('crypto');

        expect((await get('/api/markets/not-a-market')).status).toBe(404);
    });

    it('anchors every series to the live price, deterministically', async () =>
    {
        const first = await get('/api/markets/btc-150k-2026/series?outcome=yes&range=1w');
        expect(first.status).toBe(200);
        const one = (await first.json()) as Series;
        expect(one.points.length).toBe(56);
        expect(one.points[one.points.length - 1]?.p).toBe(0.34);

        const second = await get('/api/markets/btc-150k-2026/series?outcome=yes&range=1w');
        const two = (await second.json()) as Series;
        expect(two).toEqual(one);
    });

    it('rejects a series request for a range outside the schema', async () =>
    {
        expect((await get('/api/markets/btc-150k-2026/series?outcome=yes&range=1y')).status).toBe(422);
    });

    it('portfolio summary math is consistent with the positions', async () =>
    {
        const response = await get('/api/portfolio');
        const summary = (await response.json()) as PortfolioSummary;
        expect(summary.profit).toBeCloseTo(summary.current - summary.invested, 1);
        expect(summary.invested).toBeGreaterThan(0);

        const positions = await get('/api/portfolio/positions');
        expect(((await positions.json()) as unknown[]).length).toBe(POSITIONS.length);
    });

    it('ranks the leaderboard per period, profits descending', async () =>
    {
        const response = await get('/api/leaderboard?period=week');
        const rows = (await response.json()) as LeaderboardRow[];
        expect(rows.length).toBe(25);
        for (let index = 1; index < rows.length; index++)
        {
            const previous = rows[index - 1];
            const row = rows[index];
            expect(previous && row && previous.profit >= row.profit).toBe(true);
            expect(rows[index]?.rank).toBe(index + 1);
        }
    });

    it('404s cleanly outside /api when no client is mounted', async () =>
    {
        expect((await get('/nope')).status).toBe(404);
    });
});
