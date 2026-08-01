// The SIMULATED wallet session - the seam where a real wallet stack (wagmi/viem) lands
// later. Everything above reads only this store's shape, so swapping the internals for
// real connectors moves nothing else. UI phase: connect resolves after a short staged
// delay against a fixed demo address; no chain is ever touched.

import { createStore, createSignal, type Getter } from 'azerothjs';

import { readSetting, writeSetting } from '../lib/storage.ts';
import { DEMO_ADDRESS } from '../lib/wallet.ts';

import type { WalletBrand } from '../icons/brands.ts';

const STORAGE_KEY = 'auctionhouse.session';

const WALLETS: readonly WalletBrand[] = ['metamask', 'walletconnect', 'coinbase', 'phantom', 'trust', 'rabby'];

function savedWallet(): WalletBrand | null
{
    const saved = readSetting(STORAGE_KEY);
    return WALLETS.includes(saved as WalletBrand) ? saved as WalletBrand : null;
}

export interface SessionApi
{
    /** True once a wallet session is established. */
    connected: Getter<boolean>;

    /** The wallet a connection is mid-handshake with, or null. */
    connecting: Getter<WalletBrand | null>;

    /** The connected wallet brand, or null. */
    wallet: Getter<WalletBrand | null>;

    /** The session address ('' when signed out). */
    address: Getter<string>;

    /** Simulated handshake: a staged delay, then the session persists. */
    connect(brand: WalletBrand): Promise<void>;

    disconnect(): void;
}

export const useSession = createStore((): SessionApi =>
{
    const [wallet, setWallet] = createSignal<WalletBrand | null>(savedWallet());
    const [connecting, setConnecting] = createSignal<WalletBrand | null>(null);

    return {
        connected: () => wallet() !== null,
        connecting,
        wallet,
        address: () => (wallet() !== null ? DEMO_ADDRESS : ''),
        connect: async (brand) =>
        {
            setConnecting(brand);
            await new Promise((resolve) => setTimeout(resolve, 800));
            setConnecting(null);
            setWallet(brand);
            writeSetting(STORAGE_KEY, brand);
        },
        disconnect: () =>
        {
            setWallet(null);
            writeSetting(STORAGE_KEY, '');
        }
    };
});
