// The REAL wallet session. Injected wallets announce themselves via EIP-6963
// (`eip6963:announceProvider` with an rdns identity); connecting asks the chosen provider
// for accounts over EIP-1193 and adopts the REAL address. A saved session restores
// silently on boot through `eth_accounts` (no prompt), and `accountsChanged`/`disconnect`
// keep the store honest afterward. WalletConnect has no injected provider (it is an SDK
// plus a relay), so until that SDK lands it can only report "not detected".

import { createStore, createSignal, type Getter } from 'azerothjs';

import { readSetting, writeSetting } from '../lib/storage.ts';

import type { WalletBrand } from '../icons/brands.ts';

const STORAGE_KEY = 'auctionhouse.session';

/** The EIP-1193 minimum this store speaks. */
interface Eip1193Provider
{
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    on?(event: string, handler: (payload: unknown) => void): void;
}

interface Eip6963Detail
{
    info?: { rdns?: string };
    provider: Eip1193Provider;
}

/** EIP-6963 rdns identities -> the wallet grid's brand ids. */
const BRAND_RDNS: Record<string, WalletBrand> = {
    'io.metamask': 'metamask',
    'com.coinbase.wallet': 'coinbase',
    'app.phantom': 'phantom',
    'io.rabby': 'rabby',
    'com.trustwallet.app': 'trust'
};

/** Thrown when the picked wallet has not injected a provider (extension not installed). */
export class WalletUnavailableError extends Error
{
    readonly brand: WalletBrand;

    constructor(brand: WalletBrand)
    {
        super(`No injected provider for ${ brand }`);
        this.brand = brand;
    }
}

export interface SessionApi
{
    /** True once a wallet session is established. */
    connected: Getter<boolean>;

    /** The wallet a connection is mid-handshake with, or null. */
    connecting: Getter<WalletBrand | null>;

    /** The connected wallet brand, or null. */
    wallet: Getter<WalletBrand | null>;

    /** The connected account address ('' when signed out). */
    address: Getter<string>;

    /** Requests accounts from the brand's provider; throws WalletUnavailableError when the
     *  extension is not installed, and rethrows the provider's rejection when declined. */
    connect(brand: WalletBrand): Promise<void>;

    /** Clears the LOCAL session; injected wallets keep their own permission list. */
    disconnect(): void;
}

export const useSession = createStore((): SessionApi =>
{
    const [wallet, setWallet] = createSignal<WalletBrand | null>(null);
    const [address, setAddress] = createSignal('');
    const [connecting, setConnecting] = createSignal<WalletBrand | null>(null);

    const providers = new Map<WalletBrand, Eip1193Provider>();
    const watched = new Set<Eip1193Provider>();

    const clear = (): void =>
    {
        setWallet(null);
        setAddress('');
        writeSetting(STORAGE_KEY, '');
    };

    const adopt = (brand: WalletBrand, provider: Eip1193Provider, accounts: unknown): void =>
    {
        const account = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null;
        if (account === null)
        {
            return;
        }
        setWallet(brand);
        setAddress(account);
        writeSetting(STORAGE_KEY, brand);
        if (!watched.has(provider))
        {
            watched.add(provider);
            provider.on?.('accountsChanged', (next) =>
            {
                const current = Array.isArray(next) && typeof next[0] === 'string' ? next[0] : null;
                if (current === null)
                {
                    clear();
                }
                else
                {
                    setAddress(current);
                }
            });
            provider.on?.('disconnect', () => clear());
        }
    };

    if (typeof window !== 'undefined')
    {
        window.addEventListener('eip6963:announceProvider', (event) =>
        {
            const detail = (event as CustomEvent<Eip6963Detail>).detail;
            const brand = detail?.info?.rdns !== undefined ? BRAND_RDNS[detail.info.rdns] : undefined;
            if (brand === undefined || providers.has(brand))
            {
                return;
            }
            providers.set(brand, detail.provider);
            // Silent restore: a returning visitor's saved brand reconnects without a prompt
            // IF the wallet still authorizes this origin - `eth_accounts` never pops UI.
            if (readSetting(STORAGE_KEY) === brand && wallet() === null)
            {
                detail.provider.request({ method: 'eth_accounts' })
                    .then((accounts) => adopt(brand, detail.provider, accounts))
                    .catch(() => { /* a broken provider is simply not restored */ });
            }
        });
        window.dispatchEvent(new Event('eip6963:requestProvider'));
    }

    return {
        connected: () => address() !== '',
        connecting,
        wallet,
        address,
        connect: async (brand) =>
        {
            const provider = providers.get(brand);
            if (provider === undefined)
            {
                throw new WalletUnavailableError(brand);
            }
            setConnecting(brand);
            try
            {
                adopt(brand, provider, await provider.request({ method: 'eth_requestAccounts' }));
            }
            finally
            {
                setConnecting(null);
            }
        },
        disconnect: clear
    };
});
