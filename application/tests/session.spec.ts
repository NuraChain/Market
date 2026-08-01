// The simulated wallet session - the seam a real wallet stack replaces. The contract
// pinned here is what the chrome, the dashboard gate, and the trade ticket all read.
import { describe, it, expect, vi } from 'vitest';

import { shortAddress, addressGradient, DEMO_ADDRESS } from '../src/lib/wallet.ts';

describe('session identity helpers', () =>
{
    it('shortens an address to the 0x prefix and tail', () =>
    {
        expect(shortAddress(DEMO_ADDRESS)).toBe('0x430b...26dc');
    });

    it('the identicon gradient is deterministic per address', () =>
    {
        expect(addressGradient(DEMO_ADDRESS)).toBe(addressGradient(DEMO_ADDRESS));
        expect(addressGradient(DEMO_ADDRESS)).toContain('linear-gradient');
        expect(addressGradient('0xAbCd000000000000000000000000000000009999'))
            .not.toBe(addressGradient(DEMO_ADDRESS));
    });
});

describe('session store', () =>
{
    it('connects after the staged handshake and disconnects clean', async () =>
    {
        vi.useFakeTimers();
        // Imported lazily so the fake timers govern the handshake delay.
        const { useSession } = await import('../src/stores/session.store.ts');
        const { createRoot } = await import('azerothjs');

        await createRoot(async () =>
        {
            const session = useSession();
            expect(session.connected()).toBe(false);
            expect(session.address()).toBe('');

            const pending = session.connect('metamask');
            expect(session.connecting()).toBe('metamask');
            await vi.advanceTimersByTimeAsync(900);
            await pending;

            expect(session.connected()).toBe(true);
            expect(session.wallet()).toBe('metamask');
            expect(session.address()).toBe(DEMO_ADDRESS);

            session.disconnect();
            expect(session.connected()).toBe(false);
            expect(session.address()).toBe('');
        });
        vi.useRealTimers();
    });
});
