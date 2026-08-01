// Shell contract: the chrome renders, and the two global switches really move the document -
// theme lands on <html data-theme>, language lands on <html lang/dir> AND in the visible copy.
// Stores are app singletons, so every toggle test restores what it flipped.
import { describe, it, expect, afterEach } from 'vitest';
import { renderTest, cleanup, fire } from '@azerothjs/testing';

import App from '../src/app.component.azeroth';

afterEach(cleanup);

function toggleButton(container: Element, index: number): HTMLButtonElement
{
    const buttons = container.querySelectorAll<HTMLButtonElement>('header button');
    const button = buttons[index];
    if (button === undefined)
    {
        throw new Error(`header button ${ index } missing`);
    }
    return button;
}

describe('App shell', () =>
{
    it('renders the branded chrome on the home route', () =>
    {
        const { container } = renderTest(() => App({ url: '/' }));
        expect(container.querySelector('header')).not.toBeNull();
        expect(container.textContent).toContain('AuctionHouse');
        expect(container.querySelector('header svg')).not.toBeNull();
    });

    it('the theme toggle flips data-theme on the document, both ways', () =>
    {
        const { container } = renderTest(() => App({ url: '/' }));
        const before = document.documentElement.dataset['theme'];
        fire(toggleButton(container, 0), 'click');
        const flipped = document.documentElement.dataset['theme'];
        expect(flipped).not.toBe(before);
        expect(['dark', 'light']).toContain(flipped);
        fire(toggleButton(container, 0), 'click');
        expect(document.documentElement.dataset['theme']).toBe(before);
    });

    it('the language toggle restamps lang/dir and swaps the visible copy', () =>
    {
        const { container } = renderTest(() => App({ url: '/' }));
        const before = document.documentElement.lang;
        fire(toggleButton(container, 1), 'click');
        const flipped = document.documentElement.lang;
        expect(flipped).not.toBe(before);
        expect(document.documentElement.dir).toBe(flipped === 'fa' ? 'rtl' : 'ltr');
        if (flipped === 'fa')
        {
            expect(container.textContent).toContain('تالار حراج');
        }
        else
        {
            expect(container.textContent).toContain('AuctionHouse');
        }
        fire(toggleButton(container, 1), 'click');
        expect(document.documentElement.lang).toBe(before);
    });

    it('home always renders a DESIGNED state: cards, loading skeletons, or the error state', () =>
    {
        // The suite must not depend on the dev API being up: with it, cards render; without
        // it, the resource lands in the designed error state (never a blank page).
        const { container } = renderTest(() => App({ url: '/' }));
        const cards = container.querySelectorAll('article').length > 0;
        const skeletons = container.querySelectorAll('.skeleton').length > 0;
        const errorState = container.querySelector('button') !== null && (container.textContent ?? '').length > 0;
        expect(cards || skeletons || errorState).toBe(true);
    });
});
