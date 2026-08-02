import { App, json, BadRequestError, ForbiddenError, NotFoundError, type RequestObserver } from '@azerothjs/http';
import { staticFiles } from '@azerothjs/http/node';
import { feature, manifestOf, register } from '@azerothjs/http/api';
import { mountPages, type KitOptions } from '@azerothjs/kit';
import { array } from '@azerothjs/schema';
import { verifyMessage, type Address } from 'viem';

import
{
    activityItem,
    activityPage,
    activityQuery,
    addressQuery,
    adminMarketPage,
    adminStats,
    categoryCount,
    categoryInput,
    categoryMessage,
    chainConfig,
    featureInput,
    featureMessage,
    featureResult,
    holderPage,
    leaderboardQuery,
    leaderboardRow,
    market,
    marketPage,
    marketsQuery,
    portfolioSummary,
    position,
    profitSeries,
    profitSeriesQuery,
    series,
    seriesQuery,
    uploadFields,
    uploadMessage,
    uploadResult,
    type AdminMarketRow,
    type Market,
    type MarketsQuery,
    type Position
} from './schemas.ts';
import
{
    bucketSeries,
    leaderboard,
    periodStart,
    presentHolder,
    presentMarket,
    presentSide,
    presentTrade,
    profitCurve,
    rangeStart,
    sampleTimes,
    statusName,
    statusNumber,
    vwap
} from './derive.ts';

import { storeImage, MAX_IMAGE_BYTES, type Uploader } from './uploads.ts';

import type { ChainGateway } from './chain/client.ts';
import type { IndexStore, MarketRow } from './chain/store.ts';

// The whole API, declared once: routes, schemas, handlers, colocated. Every route name keys
// this object, the manifest, the browser's `client.markets.list`, and the OpenAPI operation.
// Handlers read the sqlite index the chain watcher maintains - NOTHING here is seeded data.

const DAY = 86_400;
const TRENDING_LIMIT = 9;
const DEFAULT_LIMIT = 12;

/** How long a signed admin action stays acceptable. */
const SIGNATURE_WINDOW_MS = 5 * 60_000;

/** How long a positive on-chain role check is trusted before re-reading. */
const ROLE_CACHE_MS = 60_000;

export interface ApiDeps
{
    store: IndexStore;
    chain: ChainGateway;
    treasury: Address;

    /** Where uploaded image bytes land. Omit to refuse uploads (503) rather than pretend. */
    uploader?: Uploader;
}

export function createApi(deps: ApiDeps): ReturnType<typeof build>
{
    return build(deps);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the route literal IS the type; naming it would erase per-route inference
function build({ store, chain, treasury, uploader }: ApiDeps)
{
    const nowSeconds = (): number => Math.floor(Date.now() / 1000);

    let trendingCache: { ids: Set<number>; at: number } = { ids: new Set(), at: 0 };
    const trendingIds = (): Set<number> =>
    {
        if (Date.now() - trendingCache.at > 15_000)
        {
            trendingCache = { ids: new Set(store.trendingIds(nowSeconds() - DAY, TRENDING_LIMIT)), at: Date.now() };
        }
        return trendingCache.ids;
    };

    const change24hOf = (marketId: number, prices: Map<number, number>): (idx: number) => number =>
        (idx) =>
        {
            const current = prices.get(idx) ?? 0;
            const then = store.priceAt(marketId, idx, nowSeconds() - DAY);
            return then === null ? 0 : current - then;
        };

    const present = (row: MarketRow): Market =>
    {
        const outcomes = store.outcomesOf(row.id);
        const prices = new Map(outcomes.map((outcome) => [outcome.idx, outcome.price]));
        return presentMarket(row, outcomes, {
            trending: trendingIds().has(row.id),
            change24h: change24hOf(row.id, prices)
        });
    };

    const requireMarket = (id: string): MarketRow =>
    {
        const row = store.marketById(Number(id));
        if (row === null)
        {
            throw new NotFoundError(`No market ${ id }`);
        }
        return row;
    };

    const pageOf = (query: MarketsQuery): { rows: MarketRow[]; total: number; page: number; pages: number } =>
    {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const page = query.page ?? 1;
        const listed = query.ids?.split(',').map(Number).filter(Number.isInteger);
        const filter = {
            search: query.search,
            category: query.category,
            status: query.status === undefined ? undefined : statusNumber(query.status),
            featured: query.featured,
            exclude: query.exclude === undefined ? undefined : Number(query.exclude),
            ids: query.trending === true ? [...trendingIds()] : listed,
            sort: query.sort ?? 'volume',
            page,
            limit
        } as const;
        if (filter.ids !== undefined && filter.ids.length === 0)
        {
            return { rows: [], total: 0, page: 1, pages: 1 };
        }
        const { rows, total } = store.listMarkets(filter);
        return { rows, total, page: Math.min(page, Math.max(1, Math.ceil(total / limit))), pages: Math.max(1, Math.ceil(total / limit)) };
    };

    /** Positions for one account, embedding their markets - the portfolio's whole read. */
    const positionsOf = (address: string): Position[] =>
    {
        const basis = new Map(store.buyBasis(address)
            .map((row) => [`${ row.market_id }/${ row.outcome_idx }`, vwap(row.amount, row.shares)]));
        return store.positionsOf(address).flatMap((balance) =>
        {
            const row = store.marketById(balance.market_id);
            if (row === null)
            {
                return [];
            }
            const outcomes = store.outcomesOf(row.id);
            const idx = Number(balance.token_id);
            const binary = row.outcome_count === 2 && outcomes[0]?.label_en.trim().toLowerCase() === 'yes'
                && outcomes[1]?.label_en.trim().toLowerCase() === 'no';
            const { outcomeId, side } = presentSide(binary, outcomes, idx);
            const claimable = (row.status === 3 && row.winning_outcome === idx) || row.status === 4;
            return [{
                id: `${ balance.account }-${ row.id }-${ idx }`,
                marketId: String(row.id),
                outcomeId,
                side,
                shares: balance.shares,
                avgPrice: basis.get(`${ row.id }/${ idx }`) ?? outcomes[idx]?.price ?? 0,
                openedAt: new Date(balance.first_at * 1000).toISOString(),
                claimable,
                market: present(row)
            }];
        });
    };

    const requireSigned = async (params: { address: string; issuedAt: string; signature: string; message: string }): Promise<void> =>
    {
        const issued = Date.parse(params.issuedAt);
        if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > SIGNATURE_WINDOW_MS)
        {
            throw new BadRequestError('Stale signature');
        }
        const valid = await verifyMessage({
            address: params.address as Address,
            message: params.message,
            signature: params.signature as `0x${ string }`
        });
        if (!valid)
        {
            throw new ForbiddenError('Bad signature');
        }
        await requireAdmin(params.address);
    };

    const roleCache = new Map<string, { ok: boolean; at: number }>();
    const requireAdmin = async (address: string): Promise<void> =>
    {
        const key = address.toLowerCase();
        const cached = roleCache.get(key);
        if (cached !== undefined && Date.now() - cached.at < ROLE_CACHE_MS && cached.ok)
        {
            return;
        }
        const ok = await chain.hasAdminRole(address as Address);
        roleCache.set(key, { ok, at: Date.now() });
        if (!ok)
        {
            throw new ForbiddenError('Not a factory admin');
        }
    };

    return {
        markets: feature('/markets', (routes) => ({
            list: routes.get('/', { query: marketsQuery, output: marketPage }, ({ query }) =>
            {
                const result = pageOf(query);
                return { ...result, rows: result.rows.map(present) };
            }),
            one: routes.get('/:id', { output: market }, ({ params }) => present(requireMarket(params.id))),
            series: routes.get('/:id/series', { query: seriesQuery, output: series }, ({ params, query }) =>
            {
                const row = requireMarket(params.id);
                const outcomes = store.outcomesOf(row.id);
                const target = query.outcome === 'yes'
                    ? outcomes[0]
                    : outcomes.find((outcome) => outcome.oid === query.outcome) ?? outcomes[0];
                if (target === undefined)
                {
                    throw new NotFoundError('No such outcome');
                }
                const now = nowSeconds();
                const start = rangeStart(query.range, now);
                return { points: bucketSeries(store.pricePoints(row.id, target.idx, start), start, now, target.price) };
            }),
            // Both lists page on the SERVER. They used to return a fixed slice (40 trades, 8
            // holders) with no total, so a market's tail was unreachable and the holders list
            // could never fill even one client page - its pagination control was unreachable
            // markup. The window is the caller's, the count is the whole set's.
            activity: routes.get('/:id/activity', { query: activityQuery, output: activityPage }, ({ params, query }) =>
            {
                const row = requireMarket(params.id);
                const outcomes = store.outcomesOf(row.id);
                const limit = query.limit ?? 10;
                const page = query.page ?? 1;
                const total = store.tradesCountOfMarket(row.id);
                const rows = store.tradesOfMarket(row.id, limit, (page - 1) * limit)
                    .map((trade) => presentTrade(trade, outcomes));
                return { rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
            }),
            holders: routes.get('/:id/holders', { query: activityQuery, output: holderPage }, ({ params, query }) =>
            {
                const row = requireMarket(params.id);
                const outcomes = store.outcomesOf(row.id);
                const limit = query.limit ?? 10;
                const page = query.page ?? 1;
                const total = store.holdersCountOf(row.id);
                const rows = store.holdersOf(row.id, limit, (page - 1) * limit)
                    .map((balance) => presentHolder(balance, outcomes));
                return { rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
            })
        })),
        categories: feature('/categories', (routes) => ({
            list: routes.get('/', { output: array(categoryCount) }, () => store.categories()),

            // A category's ID is the on-chain string and is never editable; this writes only
            // the presentation metadata that never lived on-chain in the first place.
            save: routes.post('/', { input: categoryInput, output: categoryCount }, async ({ input }) =>
            {
                const id = input.id.trim().toLowerCase();
                if (id === '')
                {
                    throw new BadRequestError('Category id is required');
                }
                await requireSigned({ ...input, message: categoryMessage(id, input.issuedAt) });
                store.upsertCategory({
                    id,
                    labelEn: input.labelEn.trim(),
                    labelFa: input.labelFa.trim(),
                    image: input.image.trim(),
                    sortOrder: input.sortOrder,
                    retired: input.retired
                });
                const saved = store.categories().find((entry) => entry.id === id);
                if (saved === undefined)
                {
                    throw new BadRequestError('Category did not persist');
                }
                return saved;
            })
        })),
        uploads: feature('/uploads', (routes) => ({
            // A form route, not JSON: the browser posts FormData directly (the typed client
            // refuses form routes by design). Admin-signed the same way every other write is.
            save: routes.form('/', {
                fields: uploadFields,
                output: uploadResult,
                limit: MAX_IMAGE_BYTES + 64 * 1024,
                maxFileSize: MAX_IMAGE_BYTES,
                maxParts: 8
            }, async ({ input }) =>
            {
                if (uploader === undefined)
                {
                    throw new BadRequestError('Image uploads are not configured on this deployment');
                }
                await requireSigned({ ...input.fields, message: uploadMessage(input.fields.issuedAt) });
                const file = input.files[0];
                if (file === undefined)
                {
                    throw new BadRequestError('No file was posted');
                }
                try
                {
                    return await storeImage(uploader, file.data);
                }
                catch (error)
                {
                    // storeImage rejects on CONTENT, not on transport: the wrong format or an
                    // oversized image is the caller's mistake, so it must not read as a 500.
                    throw new BadRequestError(error instanceof Error ? error.message : 'Upload rejected');
                }
            })
        })),
        chain: feature('/chain', (routes) => ({
            config: routes.get('/', { output: chainConfig }, () => ({
                chainId: chain.env.chainId,
                factory: chain.env.factory,
                treasury,
                deployBlock: chain.env.deployBlock,
                lastBlock: Math.max(store.cursor(), 0)
            }))
        })),
        portfolio: feature('/portfolio', (routes) => ({
            summary: routes.get('/', { query: addressQuery, output: portfolioSummary }, async ({ query }) =>
            {
                const address = query.address.toLowerCase();
                const positions = positionsOf(address);
                const invested = positions.reduce((sum, entry) => sum + entry.shares * entry.avgPrice, 0);
                const current = positions.reduce((sum, entry) =>
                {
                    const outcome = entry.market.outcomes.find((candidate) => candidate.id === entry.outcomeId);
                    const price = outcome?.price ?? 0;
                    return sum + entry.shares * (entry.side === 'yes' ? price : 1 - price);
                }, 0);
                const now = nowSeconds();
                const curve = profitCurve(
                    store.tradesOfAccount(address, 0),
                    store.claimsOfAccount(address, 0),
                    [now - DAY, now],
                    (marketId, idx, at) => store.priceAt(marketId, idx, at)
                );
                const profit = curve[1]?.p ?? 0;
                return {
                    balance: await chain.nativeBalance(address as Address),
                    invested,
                    current,
                    profit,
                    profitToday: profit - (curve[0]?.p ?? 0)
                };
            }),
            positions: routes.get('/positions', { query: addressQuery, output: array(position) },
                ({ query }) => positionsOf(query.address.toLowerCase())),
            series: routes.get('/series', { query: profitSeriesQuery, output: profitSeries }, ({ query }) =>
            {
                const address = query.address.toLowerCase();
                const now = nowSeconds();
                return {
                    points: profitCurve(
                        store.tradesOfAccount(address, 0),
                        store.claimsOfAccount(address, 0),
                        sampleTimes(periodStart(query.period, now), now, 40),
                        (marketId, idx, at) => store.priceAt(marketId, idx, at)
                    )
                };
            }),
            activity: routes.get('/activity', { query: addressQuery, output: array(activityItem) }, ({ query }) =>
            {
                const trades = store.tradesOfAccount(query.address.toLowerCase(), 0).reverse().slice(0, 100);
                const outcomesCache = new Map<number, ReturnType<IndexStore['outcomesOf']>>();
                return trades.map((trade) =>
                {
                    const outcomes = outcomesCache.get(trade.market_id) ?? store.outcomesOf(trade.market_id);
                    outcomesCache.set(trade.market_id, outcomes);
                    return presentTrade(trade, outcomes);
                });
            })
        })),
        leaderboard: feature('/leaderboard', (routes) => ({
            list: routes.get('/', { query: leaderboardQuery, output: array(leaderboardRow) }, ({ query }) =>
            {
                const now = nowSeconds();
                const since = periodStart(query.period, now);
                // The SAME curve the portfolio page draws, sampled at the window's ends: a
                // window's profit is what the positions were worth then vs now, plus the cash
                // that moved between. Counting the window's cash flow alone reported every
                // buyer as down exactly what they had spent, which was the default tab.
                const profitOf = (account: string): number =>
                {
                    const curve = profitCurve(
                        store.tradesOfAccount(account, 0),
                        store.claimsOfAccount(account, 0),
                        [since, now],
                        (marketId, idx, at) => store.priceAt(marketId, idx, at)
                    );
                    return (curve[1]?.p ?? 0) - (query.period === 'all' ? 0 : curve[0]?.p ?? 0);
                };
                return leaderboard(store.tradeRollup(since), profitOf, 25);
            })
        })),
        admin: feature('/admin', (routes) => ({
            activity: routes.get('/activity', { query: activityQuery, output: activityPage }, ({ query }) =>
            {
                const limit = query.limit ?? 10;
                const page = query.page ?? 1;
                const total = store.tradesCount();
                const outcomesCache = new Map<number, ReturnType<IndexStore['outcomesOf']>>();
                const rows = store.recentTrades(limit, (page - 1) * limit).map((trade) =>
                {
                    const outcomes = outcomesCache.get(trade.market_id) ?? store.outcomesOf(trade.market_id);
                    outcomesCache.set(trade.market_id, outcomes);
                    return presentTrade(trade, outcomes);
                });
                return { rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
            }),
            stats: routes.get('/stats', { output: adminStats }, () =>
            {
                const counts = store.statusCounts();
                const aggregate = store.aggregates(nowSeconds() - DAY);
                return {
                    markets: aggregate.markets,
                    open: counts[0],
                    paused: counts[1],
                    closed: counts[2],
                    resolved: counts[3],
                    voided: counts[4],
                    volume: aggregate.volume,
                    volume24h: aggregate.volume24h,
                    traders: aggregate.traders,
                    feesCollected: aggregate.fees,
                    tvl: aggregate.tvl
                };
            }),
            markets: routes.get('/markets', { query: marketsQuery, output: adminMarketPage }, ({ query }) =>
            {
                const result = pageOf(query);
                const rows: AdminMarketRow[] = result.rows.map((row) =>
                {
                    const presented = present(row);
                    return {
                        id: presented.id,
                        address: row.address,
                        title: presented.title,
                        emoji: row.emoji,
                        category: row.category,
                        status: statusName(row.status),
                        winningOutcomeId: presented.winningOutcomeId,
                        outcomeCount: row.outcome_count,
                        createdAt: new Date(row.created_at * 1000).toISOString(),
                        locksAt: new Date(row.lock_time * 1000).toISOString(),
                        resolvesAt: new Date(row.resolve_time * 1000).toISOString(),
                        liquidity: row.liquidity,
                        volume: row.volume,
                        collected: row.collected,
                        featured: row.featured === 1
                    };
                });
                return { ...result, rows };
            }),
            feature: routes.post('/feature', { input: featureInput, output: featureResult }, async ({ input }) =>
            {
                const issued = Date.parse(input.issuedAt);
                if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > SIGNATURE_WINDOW_MS)
                {
                    throw new BadRequestError('Stale signature');
                }
                const valid = await verifyMessage({
                    address: input.address as Address,
                    message: featureMessage(input.marketId, input.featured, input.issuedAt),
                    signature: input.signature as `0x${ string }`
                });
                if (!valid)
                {
                    throw new ForbiddenError('Bad signature');
                }
                await requireAdmin(input.address);
                requireMarket(input.marketId);
                store.setFeatured(Number(input.marketId), input.featured);
                return { ok: true, featured: input.featured };
            })
        }))
    };
}

export type Api = ReturnType<typeof createApi>;

export interface AppOptions extends ApiDeps
{
    dev: boolean;
    observe?: RequestObserver;

    /** Where uploaded images live on disk, served read-only at /uploads. */
    uploadDir?: string;

    /** The built client + SSR renderer (production); omit in dev - vite serves the client. */
    pages?: KitOptions;
}

export function buildApp(options: AppOptions): App
{
    const app = new App({ dev: options.dev, observe: options.observe });
    const api = createApi(options);

    app.get('/api/healthz', () => json({ ok: true, at: new Date().toISOString(), lastBlock: options.store.cursor() }));

    register(app, api);

    // The typed client's runtime half: method + path per route, projected from the SAME
    // declaration register just installed. The browser fetches it once at boot.
    app.get('/api/_manifest', () => json(manifestOf(api)));

    // Content-addressed bytes: the name IS the hash, so a cached copy can never go stale.
    if (options.uploadDir !== undefined)
    {
        app.get('/uploads/*path', staticFiles(options.uploadDir, { cacheControl: 'public, max-age=31536000, immutable' }));
    }

    // Mounted LAST so nothing shadows /api: everything else is a page or an asset, and the
    // kit reads each route's `render` mode before falling through to the built client.
    if (options.pages !== undefined)
    {
        mountPages(app, options.pages);
    }

    return app;
}
