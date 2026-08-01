// The wallet session over EIP-6963/EIP-1193: discovery by announce event, real account
// adoption, honest failure when no provider is injected. The contract pinned here is what
// the chrome, the dashboard gate, and the trade ticket all read.
import { describe, it, expect, vi } from 'vitest';

import { shortAddress, addressGradient } from '../src/lib/wallet.ts';

const ADDRESS = '0x430b4409891c6A821c81e92C960c94A80Ef626dc';

describe('session identity helpers', () =>
{
    it('shortens an address to the 0x prefix and tail', () =>
    {
        expect(shortAddress(ADDRESS)).toBe('0x430b...26dc');
    });

    it('the identicon gradient is deterministic per address', () =>
    {
        expect(addressGradient(ADDRESS)).toBe(addressGradient(ADDRESS));
        expect(addressGradient(ADDRESS)).toContain('linear-gradient');
        expect(addressGradient('0xAbCd000000000000000000000000000000009999'))
            .not.toBe(addressGradient(ADDRESS));
    });
});

describe('session store', () =>
{
    it('adopts the announced provider\'s real account and disconnects clean', async () =>
    {
        // The store's discovery listens on `window`; a bare EventTarget is enough.
        vi.stubGlobal('window', new EventTarget());
        const { useSession } = await import('../src/stores/session.store.ts');
        const { createRoot } = await import('azerothjs');

        await createRoot(async () =>
        {
            const session = useSession();
            expect(session.connected()).toBe(false);
            expect(session.address()).toBe('');

            const request = vi.fn(async ({ method }: { method: string }) =>
                (method === 'eth_requestAccounts' ? [ADDRESS] : []));
            window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
                detail: { info: { rdns: 'io.metamask' }, provider: { request, on: vi.fn() } }
            }));

            await session.connect('metamask');
            expect(request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
            expect(session.connected()).toBe(true);
            expect(session.wallet()).toBe('metamask');
            expect(session.address()).toBe(ADDRESS);

            session.disconnect();
            expect(session.connected()).toBe(false);
            expect(session.address()).toBe('');
        });
        vi.unstubAllGlobals();
    });

    it('a brand with no injected provider fails loudly, never silently pretends', async () =>
    {
        const { useSession, WalletUnavailableError } = await import('../src/stores/session.store.ts');
        const { createRoot } = await import('azerothjs');

        await createRoot(async () =>
        {
            const session = useSession();
            await expect(session.connect('walletconnect')).rejects.toBeInstanceOf(WalletUnavailableError);
            expect(session.connected()).toBe(false);
        });
    });
});
