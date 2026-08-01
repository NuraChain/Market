import { App, json, type RequestObserver } from '@azerothjs/http';
import { feature, manifestOf, register } from '@azerothjs/http/api';
import { mountPages, type KitOptions } from '@azerothjs/kit';
import { array } from '@azerothjs/schema';
import { activityItem, comment, holder, leaderboardQuery, leaderboardRow, market, portfolioSummary, position, profitSeries, profitSeriesQuery, series, seriesQuery } from './schemas.ts';
import { MARKETS, POSITIONS, activityFor, commentsFor, holdersFor, leaderboardFor, marketById, portfolioSeries, portfolioSummaryData, seriesFor, userActivity } from './data.ts';

// The whole API, declared once: routes, schemas, handlers, colocated. Every route name keys
// this object, the manifest, the browser's `client.markets.list`, and the OpenAPI operation.
// Validation happens at the boundary, so `query` is already the schema's type; the seeded
// data module behind these handlers is what a real backend replaces.
export const api = {
    markets: feature('/markets', (routes) => ({
        list: routes.get('/', { output: array(market) }, () => MARKETS),
        one: routes.get('/:id', { output: market }, ({ params }) => marketById(params.id)),
        series: routes.get('/:id/series', { query: seriesQuery, output: series },
            ({ params, query }) => seriesFor(marketById(params.id), query.outcome, query.range)),
        activity: routes.get('/:id/activity', { output: array(activityItem) },
            ({ params }) => activityFor(marketById(params.id))),
        comments: routes.get('/:id/comments', { output: array(comment) },
            ({ params }) => commentsFor(marketById(params.id))),
        holders: routes.get('/:id/holders', { output: array(holder) },
            ({ params }) => holdersFor(marketById(params.id)))
    })),
    portfolio: feature('/portfolio', (routes) => ({
        summary: routes.get('/', { output: portfolioSummary }, () => portfolioSummaryData()),
        positions: routes.get('/positions', { output: array(position) }, () => POSITIONS),
        series: routes.get('/series', { query: profitSeriesQuery, output: profitSeries },
            ({ query }) => portfolioSeries(query.period)),
        activity: routes.get('/activity', { output: array(activityItem) }, () => userActivity())
    })),
    leaderboard: feature('/leaderboard', (routes) => ({
        list: routes.get('/', { query: leaderboardQuery, output: array(leaderboardRow) },
            ({ query }) => leaderboardFor(query.period))
    }))
};

export interface AppOptions
{
    dev: boolean;
    observe?: RequestObserver;

    /** The built client + SSR renderer (production); omit in dev - vite serves the client. */
    pages?: KitOptions;
}

export function buildApp(options: AppOptions): App
{
    const app = new App({ dev: options.dev, observe: options.observe });

    app.get('/api/healthz', () => json({ ok: true, at: new Date().toISOString() }));

    register(app, api);

    // The typed client's runtime half: method + path per route, projected from the SAME
    // declaration register just installed. The browser fetches it once at boot.
    app.get('/api/_manifest', () => json(manifestOf(api)));

    // Mounted LAST so nothing shadows /api: everything else is a page or an asset, and the
    // kit reads each route's `render` mode before falling through to the built client.
    if (options.pages !== undefined)
    {
        mountPages(app, options.pages);
    }

    return app;
}
