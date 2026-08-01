// The one file that crosses into the server half - and it crosses with TYPES only. The value
// imports below are client-safe (schemas.ts imports nothing but the schema package); `typeof
// api` is erased at build, so no handler, store, or server dependency can reach the browser
// bundle. The client's runtime half is the served manifest: method + path per route, projected
// from the SAME declaration the server registered, fetched once at boot. '/api' matches the
// dev proxy and the production mount.
import { createClient, type Manifest } from '@azerothjs/http/api/shared';

import type { api } from '../../server/src/app.ts';

export { CATEGORIES, RANGES, PERIODS, SIDES } from '../../server/src/schemas.ts';
export type {
    ActivityItem, Category, Comment, Holder, LeaderboardRow, Localized, Market,
    Outcome, Period, PortfolioSummary, Position, ProfitSeries, Range, Series, SeriesPoint, Side
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

export const client = createClient<typeof api>(manifest, { baseUrl: '/api' });
