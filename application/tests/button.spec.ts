// The write-button contract. Every on-chain action in the app leans on these two properties:
// a busy button must be inert (or a second click opens a second wallet prompt), and it must
// SAY it is busy (or a signature sitting behind the wallet window reads as a dead page).
import { describe, it, expect, afterEach } from 'vitest';
import { renderTest, cleanup, fire } from '@azerothjs/testing';

import Button from '../src/components/ui/button.component.azeroth';

afterEach(cleanup);

function buttonOf(container: Element): HTMLButtonElement
{
    const button = container.querySelector('button');
    if (button === null)
    {
        throw new Error('button missing');
    }
    return button;
}

describe('Button', () =>
{
    it('is interactive and not busy by default', () =>
    {
        const { container } = renderTest(() => Button({ children: 'Buy' }));
        const button = buttonOf(container);
        expect(button.disabled).toBe(false);
        expect(button.getAttribute('aria-busy')).toBe('false');
    });

    it('loading makes it inert WITHOUT the caller also passing disabled', () =>
    {
        // The caller forgetting the second flag is exactly how a double-submit happens, so the
        // component derives it rather than trusting every call site to remember.
        const { container } = renderTest(() => Button({ loading: true, children: 'Buy' }));
        expect(buttonOf(container).disabled).toBe(true);
    });

    it('announces itself busy to assistive tech while loading', () =>
    {
        const { container } = renderTest(() => Button({ loading: true, children: 'Buy' }));
        expect(buttonOf(container).getAttribute('aria-busy')).toBe('true');
    });

    it('shows a spinner while loading and swallows the click', () =>
    {
        let clicks = 0;
        const bump = (): void =>
        {
            clicks += 1;
        };
        const { container } = renderTest(() => Button({ loading: true, onClick: bump, children: 'Buy' }));
        expect(container.querySelector('.animate-spin')).not.toBeNull();
        fire(buttonOf(container), 'click');
        expect(clicks).toBe(0);
    });

    it('swaps the icon for the spinner rather than showing both', () =>
    {
        const idle = renderTest(() => Button({ icon: 'wallet', children: 'Buy' }));
        expect(idle.container.querySelector('svg')).not.toBeNull();
        expect(idle.container.querySelector('.animate-spin')).toBeNull();
        cleanup();

        const busy = renderTest(() => Button({ icon: 'wallet', loading: true, children: 'Buy' }));
        expect(busy.container.querySelector('.animate-spin')).not.toBeNull();
        expect(busy.container.querySelector('svg')).toBeNull();
    });

    it('still fires when idle', () =>
    {
        let clicks = 0;
        const bump = (): void =>
        {
            clicks += 1;
        };
        const { container } = renderTest(() => Button({ onClick: bump, children: 'Buy' }));
        fire(buttonOf(container), 'click');
        expect(clicks).toBe(1);
    });
});
