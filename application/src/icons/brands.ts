// Wallet brand identity: labels plus the self-hosted OFFICIAL vector assets (extracted
// once from @web3icons/core's branded set into public/wallets - no CDN, no runtime icon
// dependency). Brand colors live in the assets; theme never tints them.

export type WalletBrand = 'metamask' | 'walletconnect' | 'coinbase' | 'phantom' | 'trust' | 'rabby';

export const WALLET_LABEL: Record<WalletBrand, string> = {
    metamask: 'MetaMask',
    walletconnect: 'WalletConnect',
    coinbase: 'Coinbase Wallet',
    phantom: 'Phantom',
    trust: 'Trust Wallet',
    rabby: 'Rabby'
};

export const BRAND_SRC: Record<WalletBrand, string> = {
    metamask: '/wallets/metamask.svg',
    walletconnect: '/wallets/wallet-connect.svg',
    coinbase: '/wallets/coinbase.svg',
    phantom: '/wallets/phantom.svg',
    trust: '/wallets/trust.svg',
    rabby: '/wallets/rabby.svg'
};
