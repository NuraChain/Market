// CLIENT-SAFE: the application imports this file, so it may import only the schema package.
// These shapes are the whole wire vocabulary - markets, prices, positions, the leaderboard -
// declared once for the server boundary, the manifest client, and the browser's types.
import { array, boolean, enumOf, number, object, string, type Infer } from '@azerothjs/schema';

export const CATEGORIES = ['politics', 'crypto', 'sports', 'economy', 'tech', 'culture', 'science', 'world'] as const;
export type Category = (typeof CATEGORIES)[number];

export const RANGES = ['1d', '1w', '1m', 'all'] as const;
export type Range = (typeof RANGES)[number];

export const PERIODS = ['day', 'week', 'month', 'all'] as const;
export type Period = (typeof PERIODS)[number];

export const SIDES = ['yes', 'no'] as const;
export type Side = (typeof SIDES)[number];

/** Every human-readable string crosses the wire in both languages; the client picks. */
const localized = object({ en: string(), fa: string() });
export type Localized = Infer<typeof localized>;

/**
 * One tradable outcome. A binary market has a single outcome ('yes' at `price`); a
 * multi-outcome market lists one row per candidate. `price` IS the probability (0..1);
 * `change24h` is the day's move in probability points, signed.
 */
export const outcome = object({
    id: string(),
    label: localized,
    price: number({ min: 0, max: 1 }),
    change24h: number()
});
export type Outcome = Infer<typeof outcome>;

export const market = object({
    id: string(),
    category: enumOf(CATEGORIES),
    emoji: string(),
    title: localized,
    rules: localized,
    outcomes: array(outcome),
    volume: number({ min: 0 }),
    endsAt: string(),
    createdAt: string(),
    featured: boolean(),
    trending: boolean()
});
export type Market = Infer<typeof market>;

export const seriesQuery = object({ outcome: string(), range: enumOf(RANGES) });
export const seriesPoint = object({ t: number(), p: number({ min: 0, max: 1 }) });
export const series = object({ points: array(seriesPoint) });
export type SeriesPoint = Infer<typeof seriesPoint>;
export type Series = Infer<typeof series>;

export const activityItem = object({
    id: string(),
    marketId: string(),
    user: string(),
    action: enumOf(['buy', 'sell']),
    outcomeId: string(),
    side: enumOf(SIDES),
    shares: number({ min: 0 }),
    price: number({ min: 0, max: 1 }),
    at: string()
});
export type ActivityItem = Infer<typeof activityItem>;

/** A P/L curve point: `p` is DOLLARS (signed), unlike the probability series. */
export const profitSeries = object({ points: array(object({ t: number(), p: number() })) });
export const profitSeriesQuery = object({ period: enumOf(PERIODS) });
export type ProfitSeries = Infer<typeof profitSeries>;

export const comment = object({
    id: string(),
    user: string(),
    text: localized,
    at: string(),
    likes: number({ min: 0, int: true })
});
export type Comment = Infer<typeof comment>;

export const holder = object({
    user: string(),
    outcomeId: string(),
    side: enumOf(SIDES),
    shares: number({ min: 0 })
});
export type Holder = Infer<typeof holder>;

export const position = object({
    id: string(),
    marketId: string(),
    outcomeId: string(),
    side: enumOf(SIDES),
    shares: number({ min: 0 }),
    avgPrice: number({ min: 0, max: 1 }),
    openedAt: string()
});
export type Position = Infer<typeof position>;

export const portfolioSummary = object({
    balance: number({ min: 0 }),
    invested: number({ min: 0 }),
    current: number({ min: 0 }),
    profit: number(),
    profitToday: number()
});
export type PortfolioSummary = Infer<typeof portfolioSummary>;

export const leaderboardQuery = object({ period: enumOf(PERIODS) });
export const leaderboardRow = object({
    rank: number({ int: true, min: 1 }),
    name: string(),
    profit: number(),
    volume: number({ min: 0 })
});
export type LeaderboardRow = Infer<typeof leaderboardRow>;
