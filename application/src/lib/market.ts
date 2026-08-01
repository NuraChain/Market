// Pure market predicates and lookups. DOM-free and store-free, so a card can ask
// `isBinary(market)` without pulling the markets resource (or api.ts's module graph) in.

import type { Category, Market } from '../api.ts';

import type { IconName } from '../icons/registry.ts';

export const CATEGORY_ICON: Record<Category, IconName> = {
    politics: 'cat-politics',
    crypto: 'cat-crypto',
    sports: 'cat-sports',
    economy: 'cat-economy',
    tech: 'cat-tech',
    culture: 'cat-culture',
    science: 'cat-science',
    world: 'cat-world'
};

/** The card's headline probability: a binary market's yes price, a race's leader price. */
export function leadPrice(market: Market): number
{
    return market.outcomes.reduce((best, outcome) => Math.max(best, outcome.price), 0);
}

export function isBinary(market: Market): boolean
{
    return market.outcomes.length === 1;
}

/** Case-folded substring match over BOTH languages, so search works from either keyboard. */
export function matchesQuery(market: Market, query: string): boolean
{
    const needle = query.trim().toLowerCase();
    if (needle === '')
    {
        return true;
    }
    return market.title.en.toLowerCase().includes(needle)
        || market.title.fa.includes(needle)
        || market.outcomes.some((outcome) =>
            outcome.label.en.toLowerCase().includes(needle) || outcome.label.fa.includes(needle));
}
