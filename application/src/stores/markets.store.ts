// The one markets fetch: home, browse, related rails, and the portfolio join all read this
// resource, so the list crosses the wire once per session, not once per page.

import { createStore, createResource, type Resource } from 'azerothjs';

import { client, type Market } from '../api.ts';

export const useMarkets = createStore((): Resource<Market[]> =>
    createResource(() => client.markets.list(), { name: 'markets' }));
