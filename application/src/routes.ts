// The one route table: the client router, the SSR entry, and the kit's server half all read
// it, so there is no second manifest. This phase every page renders 'client' (the SPA feel
// the animation-heavy UI wants); flipping a row to 'server'/'static' later is a flag, not a
// migration, because the entry.server contract stays wired.
import type { PageRoute } from '@azerothjs/kit';

import Home from './pages/home.page.azeroth';
import Browse from './pages/browse.page.azeroth';
import MarketPage from './pages/market.page.azeroth';
import Portfolio from './pages/portfolio.page.azeroth';
import Leaderboard from './pages/leaderboard.page.azeroth';
import Settings from './pages/settings.page.azeroth';

export const routes: PageRoute[] = [
    { path: '/', component: Home, render: 'client' },
    { path: '/browse', component: Browse, render: 'client' },
    { path: '/market/:id', component: MarketPage, render: 'client' },
    { path: '/portfolio', component: Portfolio, render: 'client' },
    { path: '/leaderboard', component: Leaderboard, render: 'client' },
    { path: '/settings', component: Settings, render: 'client' }
];
