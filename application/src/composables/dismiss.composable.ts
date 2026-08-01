import { createEffect, onCleanup } from 'azerothjs';

/**
 * The dismiss contract every floating menu shares: a pointer press OUTSIDE `root` closes it
 * while the press still reaches whatever it hit - no backdrop eating the first tap, and
 * chrome that would sit above a backdrop (the tab bar) closes it like everything else -
 * and Escape closes it and hands focus back to `trigger` so the keyboard never strands.
 * Listeners exist only while the menu is open; the page scrolls freely underneath.
 */
export function dismissOn(options: {
    open: () => boolean;
    close: () => void;
    root: () => HTMLElement | null;
    trigger?: () => HTMLElement | null;
}): void
{
    createEffect(() =>
    {
        if (!options.open() || typeof document === 'undefined')
        {
            return;
        }
        const onPress = (event: Event): void =>
        {
            const root = options.root();
            if (root === null || (event.target instanceof Node && root.contains(event.target)))
            {
                return;
            }
            options.close();
        };
        const onKey = (event: KeyboardEvent): void =>
        {
            if (event.key !== 'Escape')
            {
                return;
            }
            options.close();
            options.trigger?.()?.focus();
        };
        document.addEventListener('pointerdown', onPress, true);
        document.addEventListener('keydown', onKey, true);
        onCleanup(() =>
        {
            document.removeEventListener('pointerdown', onPress, true);
            document.removeEventListener('keydown', onKey, true);
        });
    });
}
