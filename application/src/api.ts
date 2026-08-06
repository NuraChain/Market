// The one file that crosses into the server half - and it crosses with TYPES only. The value
// imports below are client-safe (schemas.ts imports nothing but the schema package); `Api`
// is erased at build, so no handler, store, or server dependency can reach the browser
// bundle. The client's runtime half is the served manifest: method + path per route, projected
// from the SAME declaration the server registered, fetched once at boot. '/api' matches the
// dev proxy and the production mount.
import { createClient, type Manifest } from '@azerothjs/http/api/shared';

import type { Api } from '../../server/src/app.ts';

export
{
    KNOWN_CATEGORIES,
    MARKET_STATUSES,
    RANGES,
    PERIODS,
    SIDES,
    encodeTitleMeta,
    encodeTextMeta,
    decodeTitleMeta,
    decodeOutcomeMeta,
    decodeTextMeta,
    featureMessage,
    sessionMessage,
    categoryMessage,
    uploadMessage
} from '../../server/src/schemas.ts';
export type {
    ActivityItem, ActivityPage, AdminMarketPage, AdminMarketRow, AdminStats, CategoryCount, ChainConfig,
    Holder, KnownCategory, LeaderboardRow, Localized, Market, MarketPage, MarketSort,
    MarketStatusName, Outcome, Period, PortfolioSummary, Position, ProfitSeries, Range,
    Series, SeriesPoint, Side, TitleMeta
} from '../../server/src/schemas.ts';

// During SSR the module loads with an empty manifest: pages fetch data in `mount { }`, which
// runs only in the browser, so no call ever happens server-side. The browser fetches the real
// manifest before the first paint's interactions need it. An UNREACHABLE manifest (component
// tests under happy-dom, the API half down in dev) degrades to the empty manifest instead of
// failing every module that imports this one at load time.
const manifest: Manifest = typeof document === 'undefined'
    ? {}
    : await fetch('/api/_manifest')
        .then((response) => response.json() as Promise<Manifest>)
        .catch(() => ({}));

export const client = createClient<Api>(manifest, { baseUrl: '/api' });
