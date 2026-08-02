import { network } from 'hardhat';

/**
 * Seeds a REAL world onto a running local chain: bilingual markets (metadata envelopes with
 * Persian titles + emoji), custom categories, staggered lock/resolve times, trades from many
 * accounts that genuinely move prices, a spread of lifecycle states, and a few claims.
 * Deterministic: the same SEED_RANDOM produces the same world.
 *
 * Usage (after `npm run deploy:local`):
 *   npm run seed
 *   SEED_MARKETS=1000 SEED_TRADES=3000 npm run seed          (bigger world)
 *
 * Scale note: transactions run sequentially at roughly 20-40 tx/s on a local node, so
 * SEED_MARKETS=100000 works but budget hours, not minutes; the indexer catches up on its own.
 */

const MARKETS = Number(process.env.SEED_MARKETS ?? 150);
const TRADES = Number(process.env.SEED_TRADES ?? 400);
const ACCOUNTS = Math.min(Number(process.env.SEED_ACCOUNTS ?? 8), 18);
const FACTORY = process.env.FACTORY ?? '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';

/** Mirrors the canonical codec in server/src/schemas.ts. */
const title = (en: string, fa: string, emoji: string): string => JSON.stringify({ v: 1, en, fa, emoji });
const text = (en: string, fa: string): string => JSON.stringify({ v: 1, en, fa });

function mulberry32(seed: number): () => number
{
    let state = seed;
    return () =>
    {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const rand = mulberry32(Number(process.env.SEED_RANDOM ?? 42));
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const between = (low: number, high: number): number => low + Math.floor(rand() * (high - low + 1));

interface Template
{
    category: string;
    emoji: string;
    make(): { en: string; fa: string };
    outcomes: Array<{ en: string; fa: string }> | 'binary';
}

const YEARS = [2026, 2027, 2028];

const TEMPLATES: Template[] = [
    {
        category: 'crypto',
        emoji: '₿',
        make: () =>
        {
            const level = pick([100, 120, 150, 180, 200, 250]);
            const year = pick(YEARS);
            return {
                en: `Bitcoin above $${ level },000 by end of ${ year }?`,
                fa: `بیت‌کوین بالای ${ level } هزار دلار تا پایان ${ year }؟`
            };
        },
        outcomes: 'binary'
    },
    {
        category: 'crypto',
        emoji: '\u{1F48E}',
        make: () =>
        {
            const level = pick([5, 8, 10, 15]);
            const year = pick(YEARS);
            return { en: `Ethereum above $${ level },000 in ${ year }?`, fa: `اتریوم بالای ${ level } هزار دلار در ${ year }؟` };
        },
        outcomes: 'binary'
    },
    {
        category: 'politics',
        emoji: '\u{1F3DB}\u{FE0F}',
        make: () =>
        {
            const year = pick([2026, 2028]);
            return { en: `Who controls the House after the ${ year } elections?`, fa: `مجلس نمایندگان پس از انتخابات ${ year } دست کیست؟` };
        },
        outcomes: [
            { en: 'Republicans', fa: 'جمهوری‌خواهان' },
            { en: 'Democrats', fa: 'دموکرات‌ها' }
        ]
    },
    {
        category: 'world',
        emoji: '\u{1F54A}\u{FE0F}',
        make: () =>
        {
            const year = pick(YEARS);
            return { en: `Iran-EU comprehensive agreement signed in ${ year }?`, fa: `توافق جامع ایران و اروپا در ${ year } امضا می‌شود؟` };
        },
        outcomes: 'binary'
    },
    {
        category: 'sports',
        emoji: '⚽',
        make: () =>
        {
            const year = pick([2027, 2028]);
            return { en: `Who wins the ${ year } Champions League?`, fa: `قهرمان لیگ قهرمانان ${ year } کیست؟` };
        },
        outcomes: [
            { en: 'Real Madrid', fa: 'رئال مادرید' },
            { en: 'Manchester City', fa: 'منچسترسیتی' },
            { en: 'Arsenal', fa: 'آرسنال' },
            { en: 'Other', fa: 'سایر' }
        ]
    },
    {
        category: 'iran-football',
        emoji: '\u{1F7E5}',
        make: () =>
        {
            const year = pick(YEARS);
            return { en: `Winner of the ${ year } Tehran derby?`, fa: `برنده دربی تهران ${ year }؟` };
        },
        outcomes: [
            { en: 'Persepolis', fa: 'پرسپولیس' },
            { en: 'Esteghlal', fa: 'استقلال' },
            { en: 'Draw', fa: 'مساوی' }
        ]
    },
    {
        category: 'economy',
        emoji: '\u{1F4B5}',
        make: () =>
        {
            const rate = pick([2, 3, 4, 5]);
            const year = pick(YEARS);
            return { en: `US inflation under ${ rate }% for ${ year }?`, fa: `تورم آمریکا در ${ year } زیر ${ rate }٪ می‌ماند؟` };
        },
        outcomes: 'binary'
    },
    {
        category: 'tech',
        emoji: '\u{1F916}',
        make: () =>
        {
            const year = pick(YEARS);
            return { en: `A frontier lab declares AGI in ${ year }?`, fa: `یک آزمایشگاه پیشرو در ${ year } اعلام AGI می‌کند؟` };
        },
        outcomes: 'binary'
    },
    {
        category: 'ai',
        emoji: '\u{1F9E0}',
        make: () =>
        {
            const share = pick([25, 40, 50]);
            const year = pick(YEARS);
            return { en: `AI agents write over ${ share }% of merged PRs in ${ year }?`, fa: `عامل‌های هوش مصنوعی بیش از ${ share }٪ پی‌آرها را در ${ year } می‌نویسند؟` };
        },
        outcomes: 'binary'
    },
    {
        category: 'science',
        emoji: '\u{1F680}',
        make: () =>
        {
            const year = pick(YEARS);
            return { en: `Crewed lunar landing succeeds in ${ year }?`, fa: `فرود سرنشین‌دار روی ماه در ${ year } موفق می‌شود؟` };
        },
        outcomes: 'binary'
    },
    {
        category: 'culture',
        emoji: '\u{1F3AC}',
        make: () =>
        {
            const year = pick(YEARS);
            return { en: `Highest-grossing film of ${ year } is a sequel?`, fa: `پرفروش‌ترین فیلم ${ year } یک دنباله است؟` };
        },
        outcomes: 'binary'
    },
    {
        category: 'anime',
        emoji: '\u{1F5FE}',
        make: () =>
        {
            const year = pick(YEARS);
            return { en: `One Piece manga concludes in ${ year }?`, fa: `مانگای وان‌پیس در ${ year } تمام می‌شود؟` };
        },
        outcomes: 'binary'
    }
];

async function main(): Promise<void>
{
    const connection = await network.create();
    const { ethers } = connection;

    const signers = await ethers.getSigners();
    const [admin] = signers;
    const traders = signers.slice(1, 1 + ACCOUNTS);
    // Accounts past the traders bankroll the admin: seeding liquidity for thousands of
    // markets outlives one account's default balance, so the admin refills as needed.
    const funders = signers.slice(1 + ACCOUNTS);
    const factory = await ethers.getContractAt('PredictionFactory', FACTORY);
    const startId = Number(await factory.marketCount());

    const topUpAdmin = async (): Promise<void> =>
    {
        if (await ethers.provider.getBalance(admin.address) > ethers.parseEther('200'))
        {
            return;
        }
        for (const funder of funders)
        {
            const spare = await ethers.provider.getBalance(funder.address);
            if (spare > ethers.parseEther('1000'))
            {
                await (await funder.sendTransaction({ to: admin.address, value: spare - ethers.parseEther('100') })).wait();
                return;
            }
        }
        throw new Error('Every funding account is drained - start the node with larger balances for a world this size.');
    };

    console.log(`seeding ${ MARKETS } markets + ${ TRADES } trades from ${ traders.length } accounts (factory ${ FACTORY })`);

    const now = Number((await ethers.provider.getBlock('latest'))!.timestamp);
    const DAY = 86_400;
    const created: Array<{ id: number; address: string; outcomeCount: number }> = [];

    for (let i = 0; i < MARKETS; i++)
    {
        await topUpAdmin();
        const template = pick(TEMPLATES);
        const made = template.make();
        const outcomes = template.outcomes === 'binary'
            ? ['Yes', 'No']
            : template.outcomes.map((outcome) => text(outcome.en, outcome.fa));
        const lockTime = now + between(2, 60) * DAY;

        const tx = await factory.createMarket(
            {
                title: title(made.en, made.fa, template.emoji),
                description: text(
                    `Resolves per the official source for: ${ made.en }`,
                    `بر اساس منبع رسمی برای: ${ made.fa }`
                ),
                category: template.category,
                imageURI: '',
                creator: admin.address,
                lockTime,
                resolveTime: lockTime + between(1, 30) * DAY,
                feeBps: 0,
                protocolFeeShareBps: 0,
                outcomeNames: outcomes
            },
            { value: ethers.parseEther(String(between(5, 35))) }
        );
        await tx.wait();
        const id = startId + i;
        created.push({ id, address: await factory.marketAddress(id), outcomeCount: outcomes.length });
        if ((i + 1) % 25 === 0)
        {
            console.log(`  markets: ${ i + 1 }/${ MARKETS }`);
        }
    }

    for (let i = 0; i < TRADES; i++)
    {
        const target = pick(created);
        const trader = pick(traders);
        const market = await ethers.getContractAt('PredictionMarket', target.address);
        const tx = await market.connect(trader).buy(
            between(0, target.outcomeCount - 1),
            0,
            now + 365 * DAY,
            { value: ethers.parseEther(String(between(1, 40))) }
        );
        await tx.wait();
        if ((i + 1) % 50 === 0)
        {
            console.log(`  trades: ${ i + 1 }/${ TRADES }`);
        }
    }

    // Lifecycle spread: shuffle once, then carve non-overlapping segments.
    const shuffled = [...created].sort(() => rand() - 0.5);
    const take = (count: number): typeof created => shuffled.splice(0, count);
    const paused = take(Math.floor(MARKETS * 0.04));
    const closed = take(Math.floor(MARKETS * 0.04));
    const resolved = take(Math.floor(MARKETS * 0.08));
    const voided = take(Math.floor(MARKETS * 0.02));

    for (const market of paused)
    {
        await (await factory.pauseMarket(market.id)).wait();
    }
    for (const market of closed)
    {
        await (await factory.closeMarket(market.id)).wait();
    }
    for (const market of resolved)
    {
        await (await factory.resolveMarket(market.id, between(0, market.outcomeCount - 1))).wait();
    }
    for (const market of voided)
    {
        await (await factory.voidMarket(market.id)).wait();
    }
    console.log(`  lifecycle: ${ paused.length } paused, ${ closed.length } closed, ${ resolved.length } resolved, ${ voided.length } voided`);

    let claims = 0;
    for (const market of resolved)
    {
        const clone = await ethers.getContractAt('PredictionMarket', market.address);
        const winner = Number(await clone.winningOutcome());
        for (const trader of traders)
        {
            if (claims >= 12)
            {
                break;
            }
            const held = await clone.balanceOf(trader.address, winner) as bigint;
            if (held > 0n)
            {
                await (await clone.connect(trader).redeem()).wait();
                claims += 1;
            }
        }
    }
    console.log(`  claims: ${ claims }`);

    console.log(`\nseeded. markets ${ startId }..${ startId + MARKETS - 1 } - the indexer picks them up on its next poll.`);
    await connection.close?.();
}

main().catch((error) =>
{
    console.error(error);
    process.exitCode = 1;
});
