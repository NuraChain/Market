// The seeded world every screen runs on. All of it is DETERMINISTIC: series, activity,
// comments, and holders are generated from a hash of their identifiers, so a reload (or a
// test) always sees the same market history. NOW is pinned for the same reason - the mock
// world has one clock. A real backend replaces this module and nothing above it moves.

import { NotFoundError } from '@azerothjs/http';
import type { ActivityItem, Comment, Holder, LeaderboardRow, Market, Period, Position, PortfolioSummary, ProfitSeries, Range, Series, Side } from './schemas.ts';

/** The mock world's single fixed clock. */
export const NOW = Date.parse('2026-07-31T12:00:00Z');

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** FNV-1a - the seed for everything a market generates. */
function hashSeed(text: string): number
{
    let hash = 0x811C9DC5;
    for (let index = 0; index < text.length; index++)
    {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

function mulberry32(seed: number): () => number
{
    let state = seed;
    return () =>
    {
        state = (state + 0x6D2B79F5) | 0;
        let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
        mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

function clamp01(value: number): number
{
    return Math.min(0.97, Math.max(0.03, value));
}

const yes = (price: number, change24h: number): Market['outcomes'] =>
    [{ id: 'yes', label: { en: 'Yes', fa: 'بله' }, price, change24h }];

export const MARKETS: Market[] = [
    {
        id: 'btc-150k-2026',
        category: 'crypto',
        emoji: '🪙',
        title: {
            en: 'Bitcoin above $150,000 by December 31, 2026?',
            fa: 'بیت‌کوین تا پایان ۲۰۲۶ بالای ۱۵۰ هزار دلار می‌رود؟'
        },
        rules: {
            en: 'Resolves YES if BTC/USD trades at or above $150,000 on any major exchange before Jan 1, 2027 (UTC). A single printed trade is sufficient.',
            fa: 'اگر بیت‌کوین پیش از اول ژانویه ۲۰۲۷ (UTC) در هر صرافی معتبر به ۱۵۰ هزار دلار یا بالاتر برسد، «بله» تسویه می‌شود. یک معامله ثبت‌شده کافی است.'
        },
        outcomes: yes(0.34, 2.1),
        volume: 12_600_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-01-05T00:00:00Z',
        featured: true,
        trending: true
    },
    {
        id: 'iran-eu-agreement-2026',
        category: 'world',
        emoji: '🕊️',
        title: {
            en: 'Iran-EU nuclear agreement signed in 2026?',
            fa: 'توافق هسته‌ای ایران و اروپا در ۲۰۲۶ امضا می‌شود؟'
        },
        rules: {
            en: 'Resolves YES if Iran and the EU (or E3) sign a comprehensive nuclear agreement before Jan 1, 2027. Frameworks and joint statements do not count.',
            fa: 'اگر ایران و اتحادیه اروپا (یا تروییکای اروپایی) پیش از اول ژانویه ۲۰۲۷ توافق جامع هسته‌ای امضا کنند، «بله» تسویه می‌شود. بیانیه مشترک و چارچوب اولیه کافی نیست.'
        },
        outcomes: yes(0.29, 4.6),
        volume: 11_400_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-02-14T00:00:00Z',
        featured: true,
        trending: true
    },
    {
        id: 'house-control-2026',
        category: 'politics',
        emoji: '🗳️',
        title: {
            en: 'Who controls the House after the 2026 midterms?',
            fa: 'پس از انتخابات میان‌دوره‌ای ۲۰۲۶ کدام حزب مجلس نمایندگان را در دست می‌گیرد؟'
        },
        rules: {
            en: 'Resolves to the party holding the majority of House seats when the 120th Congress is seated in January 2027.',
            fa: 'بر اساس حزبی تسویه می‌شود که هنگام آغاز کنگره صد و بیستم در ژانویه ۲۰۲۷ اکثریت کرسی‌های مجلس نمایندگان را در اختیار دارد.'
        },
        outcomes: [
            { id: 'republicans', label: { en: 'Republicans', fa: 'جمهوری‌خواهان' }, price: 0.58, change24h: -0.7 },
            { id: 'democrats', label: { en: 'Democrats', fa: 'دموکرات‌ها' }, price: 0.42, change24h: 0.7 }
        ],
        volume: 24_100_000,
        endsAt: '2026-11-04T00:00:00Z',
        createdAt: '2026-01-20T00:00:00Z',
        featured: true,
        trending: true
    },
    {
        id: 'us-ai-act-2026',
        category: 'politics',
        emoji: '🏛️',
        title: {
            en: 'Will the US pass a federal AI safety act in 2026?',
            fa: 'آیا آمریکا در ۲۰۲۶ قانون فدرال ایمنی هوش مصنوعی تصویب می‌کند؟'
        },
        rules: {
            en: 'Resolves YES if a federal AI safety act is signed into law before Jan 1, 2027. Committee approvals alone do not count.',
            fa: 'اگر پیش از اول ژانویه ۲۰۲۷ قانون فدرال ایمنی هوش مصنوعی به امضا برسد، «بله» تسویه می‌شود. تصویب در کمیته به‌تنهایی کافی نیست.'
        },
        outcomes: yes(0.27, -1.4),
        volume: 8_400_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-03-02T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'ucl-2027-winner',
        category: 'sports',
        emoji: '⚽',
        title: {
            en: 'Who wins the 2026-27 Champions League?',
            fa: 'قهرمان لیگ قهرمانان اروپا ۲۰۲۶-۲۷ کیست؟'
        },
        rules: {
            en: 'Resolves to the club lifting the trophy at the 2027 final. All other listed clubs resolve NO.',
            fa: 'بر اساس باشگاهی تسویه می‌شود که جام فینال ۲۰۲۷ را بالای سر ببرد. سایر گزینه‌ها «خیر» تسویه می‌شوند.'
        },
        outcomes: [
            { id: 'real-madrid', label: { en: 'Real Madrid', fa: 'رئال مادرید' }, price: 0.24, change24h: -0.4 },
            { id: 'man-city', label: { en: 'Man City', fa: 'منچسترسیتی' }, price: 0.19, change24h: 0.6 },
            { id: 'bayern', label: { en: 'Bayern', fa: 'بایرن مونیخ' }, price: 0.14, change24h: 0.2 },
            { id: 'psg', label: { en: 'PSG', fa: 'پاری‌سن‌ژرمن' }, price: 0.13, change24h: -0.1 },
            { id: 'arsenal', label: { en: 'Arsenal', fa: 'آرسنال' }, price: 0.11, change24h: 0.9 }
        ],
        volume: 9_800_000,
        endsAt: '2027-06-06T00:00:00Z',
        createdAt: '2026-06-15T00:00:00Z',
        featured: true,
        trending: true
    },
    {
        id: 'esteghlal-league-2027',
        category: 'sports',
        emoji: '🔵',
        title: {
            en: 'Esteghlal wins the 2026-27 Persian Gulf Pro League?',
            fa: 'استقلال قهرمان لیگ برتر خلیج فارس ۱۴۰۴-۰۵ می‌شود؟'
        },
        rules: {
            en: 'Resolves YES if Esteghlal FC finishes first in the 2026-27 Persian Gulf Pro League season.',
            fa: 'اگر باشگاه استقلال در پایان فصل ۱۴۰۴-۰۵ لیگ برتر خلیج فارس در رده نخست بایستد، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.18, -0.6),
        volume: 640_000,
        endsAt: '2027-05-30T00:00:00Z',
        createdAt: '2026-07-01T00:00:00Z',
        featured: false,
        trending: true
    },
    {
        id: 'fed-below-3-2027',
        category: 'economy',
        emoji: '🏦',
        title: {
            en: 'Fed funds rate below 3% by March 2027?',
            fa: 'نرخ بهره فدرال رزرو تا مارس ۲۰۲۷ زیر ۳٪ می‌رسد؟'
        },
        rules: {
            en: 'Resolves YES if the upper bound of the federal funds target range is below 3.00% at any FOMC decision before April 2027.',
            fa: 'اگر سقف بازه هدف نرخ بهره فدرال در هر یک از نشست‌های FOMC پیش از آوریل ۲۰۲۷ زیر ۳٪ تعیین شود، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.44, 1.2),
        volume: 6_100_000,
        endsAt: '2027-03-20T00:00:00Z',
        createdAt: '2026-04-10T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'us-recession-2026',
        category: 'economy',
        emoji: '📉',
        title: {
            en: 'US recession declared before 2027?',
            fa: 'رکود اقتصادی آمریکا پیش از ۲۰۲۷ اعلام می‌شود؟'
        },
        rules: {
            en: 'Resolves YES if the NBER declares a US recession with a start date in 2025 or 2026, announced before Jan 1, 2027.',
            fa: 'اگر NBER پیش از اول ژانویه ۲۰۲۷ رکودی با تاریخ شروع در ۲۰۲۵ یا ۲۰۲۶ اعلام کند، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.21, -0.9),
        volume: 5_300_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-02-01T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'foldable-iphone-2027',
        category: 'tech',
        emoji: '📱',
        title: {
            en: 'Apple ships a foldable iPhone by end of 2027?',
            fa: 'اپل تا پایان ۲۰۲۷ آیفون تاشو عرضه می‌کند؟'
        },
        rules: {
            en: 'Resolves YES if Apple makes a foldable iPhone generally available for purchase before Jan 1, 2028.',
            fa: 'اگر اپل پیش از اول ژانویه ۲۰۲۸ آیفون تاشو را به‌صورت عمومی برای خرید عرضه کند، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.47, 3.4),
        volume: 3_800_000,
        endsAt: '2028-01-01T00:00:00Z',
        createdAt: '2026-05-22T00:00:00Z',
        featured: false,
        trending: true
    },
    {
        id: 'agi-claim-2028',
        category: 'tech',
        emoji: '🤖',
        title: {
            en: 'A frontier lab claims AGI before 2028?',
            fa: 'یک آزمایشگاه پیشرو پیش از ۲۰۲۸ ادعای AGI می‌کند؟'
        },
        rules: {
            en: 'Resolves YES if OpenAI, Anthropic, or Google DeepMind officially describes a released model as AGI before Jan 1, 2028.',
            fa: 'اگر OpenAI، Anthropic یا Google DeepMind پیش از اول ژانویه ۲۰۲۸ مدلی منتشرشده را رسما AGI بنامند، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.31, 1.8),
        volume: 7_200_000,
        endsAt: '2028-01-01T00:00:00Z',
        createdAt: '2026-03-18T00:00:00Z',
        featured: true,
        trending: false
    },
    {
        id: 'swift-tour-2027',
        category: 'culture',
        emoji: '🎤',
        title: {
            en: 'Taylor Swift announces a 2027 world tour?',
            fa: 'تیلور سوییفت تور جهانی ۲۰۲۷ اعلام می‌کند؟'
        },
        rules: {
            en: 'Resolves YES on an official announcement, before Jan 1, 2027, of a multi-country tour with 2027 dates.',
            fa: 'اگر پیش از اول ژانویه ۲۰۲۷ توری چندکشوری با تاریخ‌های ۲۰۲۷ به‌طور رسمی اعلام شود، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.55, -2.2),
        volume: 1_900_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-06-01T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'gta6-50m-first-year',
        category: 'culture',
        emoji: '🎮',
        title: {
            en: 'GTA VI sells 50M copies in its first year?',
            fa: 'GTA VI در سال نخست ۵۰ میلیون نسخه می‌فروشد؟'
        },
        rules: {
            en: 'Resolves YES if official or credible industry figures show 50 million units sold within 12 months of release.',
            fa: 'اگر آمار رسمی یا معتبر صنعت نشان دهد ظرف ۱۲ ماه از انتشار ۵۰ میلیون نسخه فروخته شده، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.68, 0.4),
        volume: 8_900_000,
        endsAt: '2027-11-19T00:00:00Z',
        createdAt: '2026-05-10T00:00:00Z',
        featured: false,
        trending: true
    },
    {
        id: 'starship-mars-2028',
        category: 'science',
        emoji: '🚀',
        title: {
            en: 'Starship reaches Mars orbit by 2028?',
            fa: 'استارشیپ تا ۲۰۲۸ به مدار مریخ می‌رسد؟'
        },
        rules: {
            en: 'Resolves YES if a SpaceX Starship vehicle achieves Mars orbit insertion before Jan 1, 2029.',
            fa: 'اگر یکی از فضاپیماهای استارشیپ اسپیس‌ایکس پیش از اول ژانویه ۲۰۲۹ در مدار مریخ قرار گیرد، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.12, -0.3),
        volume: 4_600_000,
        endsAt: '2028-12-31T00:00:00Z',
        createdAt: '2026-01-30T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'crispr-second-approval-2026',
        category: 'science',
        emoji: '🧬',
        title: {
            en: 'A second CRISPR therapy approved in 2026?',
            fa: 'دومین درمان کریسپر در ۲۰۲۶ تأیید می‌شود؟'
        },
        rules: {
            en: 'Resolves YES if the FDA or EMA approves a second distinct CRISPR-based therapy before Jan 1, 2027.',
            fa: 'اگر FDA یا EMA پیش از اول ژانویه ۲۰۲۷ دومین درمان مبتنی بر کریسپر را تأیید کنند، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.39, 0.6),
        volume: 980_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-04-25T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'eth-staking-etf-2026',
        category: 'crypto',
        emoji: '💠',
        title: {
            en: 'Ethereum ETF staking approved in 2026?',
            fa: 'استیکینگ در ETFهای اتریوم در ۲۰۲۶ تأیید می‌شود؟'
        },
        rules: {
            en: 'Resolves YES if the SEC permits staking within a US spot Ethereum ETF before Jan 1, 2027.',
            fa: 'اگر SEC پیش از اول ژانویه ۲۰۲۷ استیکینگ را در ETF اسپات اتریوم در آمریکا مجاز کند، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.61, 0.8),
        volume: 4_200_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-03-08T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'heat-record-2026',
        category: 'world',
        emoji: '🌡️',
        title: {
            en: '2026 sets a new global temperature record?',
            fa: 'سال ۲۰۲۶ رکورد جدید دمای جهانی ثبت می‌کند؟'
        },
        rules: {
            en: 'Resolves YES if 2026 is reported as the warmest calendar year on record by NASA GISS or Copernicus.',
            fa: 'اگر ناسا یا کوپرنیکوس سال ۲۰۲۶ را گرم‌ترین سال ثبت‌شده اعلام کنند، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.73, 0.2),
        volume: 2_700_000,
        endsAt: '2027-01-15T00:00:00Z',
        createdAt: '2026-01-12T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'us-shutdown-2026',
        category: 'politics',
        emoji: '📜',
        title: { en: 'US government shutdown before 2027?', fa: 'تعطیلی دولت آمریکا پیش از ۲۰۲۷؟' },
        rules: {
            en: 'Resolves YES on any lapse in US federal appropriations before Jan 1, 2027.',
            fa: 'با هر وقفه در بودجه فدرال آمریکا پیش از اول ژانویه ۲۰۲۷، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.24, -0.5),
        volume: 3_100_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-05-02T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'uk-snap-election-2026',
        category: 'politics',
        emoji: '🏰',
        title: { en: 'Snap UK general election called in 2026?', fa: 'انتخابات زودهنگام بریتانیا در ۲۰۲۶ اعلام می‌شود؟' },
        rules: {
            en: 'Resolves YES if a UK general election is formally called with a 2026 polling date.',
            fa: 'اگر انتخابات سراسری بریتانیا با تاریخ رای‌گیری در ۲۰۲۶ رسما اعلام شود، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.15, 0.2),
        volume: 890_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-06-20T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'eth-10k-2026',
        category: 'crypto',
        emoji: '🔷',
        title: { en: 'Ethereum above $10,000 by 2027?', fa: 'اتریوم تا ۲۰۲۷ بالای ۱۰ هزار دلار می‌رود؟' },
        rules: {
            en: 'Resolves YES if ETH/USD trades at or above $10,000 on any major exchange before Jan 1, 2027.',
            fa: 'اگر اتریوم پیش از اول ژانویه ۲۰۲۷ در صرافی معتبری به ۱۰ هزار دلار برسد، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.28, 1.5),
        volume: 6_800_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-02-25T00:00:00Z',
        featured: false,
        trending: true
    },
    {
        id: 'sol-flip-eth-2027',
        category: 'crypto',
        emoji: '🟣',
        title: { en: 'Solana flips Ethereum by market cap before 2028?', fa: 'سولانا پیش از ۲۰۲۸ از اتریوم در ارزش بازار جلو می‌زند؟' },
        rules: {
            en: 'Resolves YES if SOL market cap exceeds ETH market cap for a full day before Jan 1, 2028.',
            fa: 'اگر ارزش بازار سولانا پیش از اول ژانویه ۲۰۲۸ یک روز کامل از اتریوم بیشتر باشد، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.09, -0.2),
        volume: 2_200_000,
        endsAt: '2028-01-01T00:00:00Z',
        createdAt: '2026-04-14T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'nba-2027-champion',
        category: 'sports',
        emoji: '🏀',
        title: { en: 'Who wins the 2027 NBA championship?', fa: 'قهرمان NBA در ۲۰۲۷ کیست؟' },
        rules: {
            en: 'Resolves to the club winning the 2027 NBA Finals. All other listed clubs resolve NO.',
            fa: 'بر اساس تیمی تسویه می‌شود که فینال ۲۰۲۷ NBA را ببرد. سایر گزینه‌ها «خیر» تسویه می‌شوند.'
        },
        outcomes: [
            { id: 'celtics', label: { en: 'Celtics', fa: 'سلتیکس' }, price: 0.21, change24h: 0.4 },
            { id: 'thunder', label: { en: 'Thunder', fa: 'تاندر' }, price: 0.19, change24h: -0.3 },
            { id: 'nuggets', label: { en: 'Nuggets', fa: 'ناگتس' }, price: 0.15, change24h: 0.1 },
            { id: 'knicks', label: { en: 'Knicks', fa: 'نیکس' }, price: 0.11, change24h: 0.6 }
        ],
        volume: 5_400_000,
        endsAt: '2027-06-20T00:00:00Z',
        createdAt: '2026-07-05T00:00:00Z',
        featured: false,
        trending: true
    },
    {
        id: 'f1-2026-verstappen',
        category: 'sports',
        emoji: '🏎️',
        title: { en: 'Verstappen wins the 2026 F1 title?', fa: 'فرشتاپن قهرمان فرمول یک ۲۰۲۶ می‌شود؟' },
        rules: {
            en: 'Resolves YES if Max Verstappen wins the 2026 Formula 1 drivers championship.',
            fa: 'اگر مکس فرشتاپن قهرمان فصل ۲۰۲۶ رانندگان فرمول یک شود، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.41, -1.1),
        volume: 3_900_000,
        endsAt: '2026-12-06T00:00:00Z',
        createdAt: '2026-03-30T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'oil-100-2027',
        category: 'economy',
        emoji: '🛢️',
        title: { en: 'Oil above $100 before 2028?', fa: 'نفت پیش از ۲۰۲۸ بالای ۱۰۰ دلار می‌رود؟' },
        rules: {
            en: 'Resolves YES if Brent crude settles at or above $100 on any trading day before Jan 1, 2028.',
            fa: 'اگر نفت برنت پیش از اول ژانویه ۲۰۲۸ در یک روز معاملاتی روی ۱۰۰ دلار یا بالاتر بسته شود، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.33, 0.9),
        volume: 4_400_000,
        endsAt: '2028-01-01T00:00:00Z',
        createdAt: '2026-05-15T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'gold-3500-2026',
        category: 'economy',
        emoji: '🥇',
        title: { en: 'Gold above $3,500 by 2027?', fa: 'طلا تا ۲۰۲۷ بالای ۳۵۰۰ دلار می‌رود؟' },
        rules: {
            en: 'Resolves YES if spot gold trades at or above $3,500/oz before Jan 1, 2027.',
            fa: 'اگر طلای جهانی پیش از اول ژانویه ۲۰۲۷ به ۳۵۰۰ دلار در اونس برسد، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.58, 0.3),
        volume: 5_900_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-01-28T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'gpt6-2027',
        category: 'tech',
        emoji: '🧠',
        title: { en: 'OpenAI ships GPT-6 before 2028?', fa: 'OpenAI پیش از ۲۰۲۸ مدل GPT-6 را عرضه می‌کند؟' },
        rules: {
            en: 'Resolves YES if OpenAI makes a model officially named GPT-6 generally available before Jan 1, 2028.',
            fa: 'اگر OpenAI پیش از اول ژانویه ۲۰۲۸ مدلی با نام رسمی GPT-6 عرضه عمومی کند، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.52, 2.4),
        volume: 8_100_000,
        endsAt: '2028-01-01T00:00:00Z',
        createdAt: '2026-06-08T00:00:00Z',
        featured: false,
        trending: true
    },
    {
        id: 'eu-ai-fine-2026',
        category: 'tech',
        emoji: '⚖️',
        title: { en: 'First EU AI Act fine issued in 2026?', fa: 'نخستین جریمه قانون هوش مصنوعی اروپا در ۲۰۲۶ صادر می‌شود؟' },
        rules: {
            en: 'Resolves YES if an EU regulator issues a monetary fine under the AI Act before Jan 1, 2027.',
            fa: 'اگر نهاد ناظر اروپایی پیش از اول ژانویه ۲۰۲۷ جریمه نقدی ذیل قانون هوش مصنوعی صادر کند، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.37, 0.5),
        volume: 1_300_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-04-22T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'oscars-2027-animated',
        category: 'culture',
        emoji: '🎬',
        title: { en: 'An animated film wins Best Picture at the 2027 Oscars?', fa: 'یک انیمیشن در اسکار ۲۰۲۷ بهترین فیلم می‌شود؟' },
        rules: {
            en: 'Resolves YES if the Academy Award for Best Picture at the 2027 ceremony goes to an animated feature.',
            fa: 'اگر جایزه بهترین فیلم اسکار ۲۰۲۷ به یک انیمیشن بلند برسد، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.06, 0.1),
        volume: 740_000,
        endsAt: '2027-03-15T00:00:00Z',
        createdAt: '2026-07-18T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'mrbeast-500m-2027',
        category: 'culture',
        emoji: '📺',
        title: { en: 'MrBeast reaches 500M subscribers by 2028?', fa: 'مستربیست تا ۲۰۲۸ به ۵۰۰ میلیون دنبال‌کننده می‌رسد؟' },
        rules: {
            en: 'Resolves YES if the main MrBeast YouTube channel shows 500M subscribers before Jan 1, 2028.',
            fa: 'اگر کانال اصلی یوتیوب مستربیست پیش از اول ژانویه ۲۰۲۸ ۵۰۰ میلیون دنبال‌کننده نشان دهد، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.44, 0.7),
        volume: 1_600_000,
        endsAt: '2028-01-01T00:00:00Z',
        createdAt: '2026-06-28T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'fusion-record-2026',
        category: 'science',
        emoji: '⚛️',
        title: { en: 'New fusion net-gain record announced in 2026?', fa: 'رکورد جدید بهره خالص همجوشی در ۲۰۲۶ اعلام می‌شود؟' },
        rules: {
            en: 'Resolves YES if a laboratory announces a fusion shot exceeding the current net-energy-gain record before Jan 1, 2027.',
            fa: 'اگر آزمایشگاهی پیش از اول ژانویه ۲۰۲۷ شلیکی با بهره انرژی بالاتر از رکورد فعلی اعلام کند، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.62, 1.2),
        volume: 2_900_000,
        endsAt: '2027-01-01T00:00:00Z',
        createdAt: '2026-02-10T00:00:00Z',
        featured: false,
        trending: false
    },
    {
        id: 'alzheimers-approval-2027',
        category: 'science',
        emoji: '💊',
        title: { en: 'New Alzheimer\'s drug approved before 2028?', fa: 'داروی جدید آلزایمر پیش از ۲۰۲۸ تأیید می‌شود؟' },
        rules: {
            en: 'Resolves YES if the FDA approves a new disease-modifying Alzheimer\'s therapy before Jan 1, 2028.',
            fa: 'اگر FDA پیش از اول ژانویه ۲۰۲۸ درمان تعدیل‌کننده جدیدی برای آلزایمر تأیید کند، «بله» تسویه می‌شود.'
        },
        outcomes: yes(0.49, 0.4),
        volume: 3_300_000,
        endsAt: '2028-01-01T00:00:00Z',
        createdAt: '2026-03-12T00:00:00Z',
        featured: false,
        trending: false
    }
];

export function marketById(id: string): Market
{
    const found = MARKETS.find((candidate) => candidate.id === id);
    if (found === undefined)
    {
        throw new NotFoundError('No such market');
    }
    return found;
}

const RANGE_SHAPE: Record<Range, { points: number; stepMs: number; spread: number }> = {
    '1d': { points: 24, stepMs: HOUR, spread: 0.05 },
    '1w': { points: 56, stepMs: 3 * HOUR, spread: 0.10 },
    '1m': { points: 30, stepMs: DAY, spread: 0.16 },
    'all': { points: 90, stepMs: 2 * DAY, spread: 0.26 }
};

/**
 * A deterministic random walk ANCHORED at the outcome's live price: the walk is generated
 * freely, then blended linearly toward the anchor so the last point always equals what the
 * card shows. A chart that disagrees with its own price label reads as a bug.
 */
export function seriesFor(market: Market, outcomeId: string, range: Range): Series
{
    const outcome = market.outcomes.find((candidate) => candidate.id === outcomeId);
    if (outcome === undefined)
    {
        throw new NotFoundError('No such outcome');
    }

    const shape = RANGE_SHAPE[range];
    const random = mulberry32(hashSeed(`${ market.id }/${ outcomeId }/${ range }`));

    const walk: number[] = [clamp01(outcome.price + shape.spread * (random() - 0.5) * 2)];
    for (let index = 1; index < shape.points; index++)
    {
        const step = (random() - 0.5) * shape.spread * 0.35;
        walk.push(clamp01((walk[index - 1] ?? outcome.price) + step));
    }

    const last = walk[walk.length - 1] ?? outcome.price;
    const points = walk.map((value, index) =>
    {
        const blend = index / (walk.length - 1);
        return {
            t: NOW - (shape.points - 1 - index) * shape.stepMs,
            p: Number(clamp01(value + (outcome.price - last) * blend).toFixed(4))
        };
    });
    const anchor = points[points.length - 1];
    if (anchor !== undefined)
    {
        anchor.p = outcome.price;
    }

    return { points };
}

const TRADERS = [
    'IntelligentQuantum', 'NoraTrades', 'arman_v', 'kianoosh', 'SaraMkt',
    'delta_hand', 'MahsaK', 'OracleFan', 'TabrizBull', 'quietwhale'
] as const;

export function activityFor(market: Market): ActivityItem[]
{
    const random = mulberry32(hashSeed(`${ market.id }/activity`));
    const items: ActivityItem[] = [];
    for (let index = 0; index < 18; index++)
    {
        const outcome = market.outcomes[Math.floor(random() * market.outcomes.length)];
        if (outcome === undefined)
        {
            continue;
        }
        const side: Side = random() < 0.5 ? 'yes' : 'no';
        const drift = (random() - 0.5) * 0.06;
        items.push({
            id: `${ market.id }-act-${ index }`,
            marketId: market.id,
            user: TRADERS[Math.floor(random() * TRADERS.length)] ?? 'quietwhale',
            action: random() < 0.72 ? 'buy' : 'sell',
            outcomeId: outcome.id,
            side,
            shares: Math.round(10 + random() * 990),
            price: Number(clamp01((side === 'yes' ? outcome.price : 1 - outcome.price) + drift).toFixed(2)),
            at: new Date(NOW - Math.round(random() * 48) * (HOUR / 2)).toISOString()
        });
    }
    return items.sort((left, right) => right.at.localeCompare(left.at));
}

const COMMENT_POOL: Array<{ en: string; fa: string }> = [
    { en: 'The polls have been moving all week - this is underpriced.', fa: 'نظرسنجی‌ها کل هفته در حرکت بودند؛ این قیمت پایین است.' },
    { en: 'Volume is picking up fast. Someone knows something.', fa: 'حجم دارد سریع بالا می‌رود. یکی چیزی می‌داند.' },
    { en: 'I took the other side of this at 20. Feeling good.', fa: 'من طرف مقابل را روی ۲۰ گرفتم. حس خوبی دارم.' },
    { en: 'The resolution rules are stricter than people think - read them.', fa: 'قوانین تسویه سخت‌گیرانه‌تر از تصور عمومی است؛ حتما بخوانید.' },
    { en: 'This tracks the base rate almost perfectly.', fa: 'این تقریبا دقیق با نرخ پایه حرکت می‌کند.' },
    { en: 'Selling into every spike has printed all month.', fa: 'فروش در هر جهش، کل ماه جواب داده است.' }
];

export function commentsFor(market: Market): Comment[]
{
    const random = mulberry32(hashSeed(`${ market.id }/comments`));
    return COMMENT_POOL.map((text, index) => ({
        id: `${ market.id }-com-${ index }`,
        user: TRADERS[Math.floor(random() * TRADERS.length)] ?? 'OracleFan',
        text,
        at: new Date(NOW - Math.round(2 + random() * 120) * HOUR).toISOString(),
        likes: Math.round(random() * 40)
    }));
}

export function holdersFor(market: Market): Holder[]
{
    const random = mulberry32(hashSeed(`${ market.id }/holders`));
    const rows: Holder[] = [];
    for (let index = 0; index < 8; index++)
    {
        const outcome = market.outcomes[Math.floor(random() * market.outcomes.length)];
        if (outcome === undefined)
        {
            continue;
        }
        rows.push({
            user: TRADERS[(index + 1) % TRADERS.length] ?? 'delta_hand',
            outcomeId: outcome.id,
            side: random() < 0.7 ? 'yes' : 'no',
            shares: Math.round(500 + random() * 24_500)
        });
    }
    return rows.sort((left, right) => right.shares - left.shares);
}

const PERIOD_POINTS: Record<Period, { points: number; stepMs: number }> = {
    day: { points: 24, stepMs: HOUR },
    week: { points: 56, stepMs: 3 * HOUR },
    month: { points: 30, stepMs: DAY },
    all: { points: 90, stepMs: 2 * DAY }
};

/** The demo user's P/L curve, in DOLLARS, anchored so the last point equals the live
 *  summary profit - a chart that disagrees with the number beside it reads as a bug. */
export function portfolioSeries(period: Period): ProfitSeries
{
    const target = portfolioSummaryData().profit;
    const shape = PERIOD_POINTS[period];
    const random = mulberry32(hashSeed(`portfolio/${ period }`));
    const spread = Math.max(30, Math.abs(target));

    const walk: number[] = [target - spread * (random() - 0.3)];
    for (let index = 1; index < shape.points; index++)
    {
        walk.push((walk[index - 1] ?? 0) + (random() - 0.48) * spread * 0.2);
    }

    const last = walk[walk.length - 1] ?? target;
    const points = walk.map((value, index) =>
    {
        const blend = index / (walk.length - 1);
        return {
            t: NOW - (shape.points - 1 - index) * shape.stepMs,
            p: Number((value + (target - last) * blend).toFixed(2))
        };
    });
    const anchor = points[points.length - 1];
    if (anchor !== undefined)
    {
        anchor.p = target;
    }
    return { points };
}

/** The demo user's own trade feed, drawn from the same seeded per-market activity. */
export function userActivity(): ActivityItem[]
{
    return MARKETS
        .flatMap((market) => activityFor(market))
        .filter((item) => item.user === 'IntelligentQuantum')
        .sort((left, right) => right.at.localeCompare(left.at));
}

/** The demo visitor's book - IntelligentQuantum's open positions. */
export const POSITIONS: Position[] = [
    { id: 'pos-1', marketId: 'btc-150k-2026', outcomeId: 'yes', side: 'yes', shares: 420, avgPrice: 0.29, openedAt: '2026-06-02T09:30:00Z' },
    { id: 'pos-2', marketId: 'iran-eu-agreement-2026', outcomeId: 'yes', side: 'yes', shares: 800, avgPrice: 0.21, openedAt: '2026-05-18T14:00:00Z' },
    { id: 'pos-3', marketId: 'us-recession-2026', outcomeId: 'yes', side: 'no', shares: 300, avgPrice: 0.74, openedAt: '2026-06-20T11:15:00Z' },
    { id: 'pos-4', marketId: 'swift-tour-2027', outcomeId: 'yes', side: 'yes', shares: 150, avgPrice: 0.62, openedAt: '2026-07-08T19:45:00Z' },
    { id: 'pos-5', marketId: 'ucl-2027-winner', outcomeId: 'real-madrid', side: 'yes', shares: 200, avgPrice: 0.26, openedAt: '2026-07-12T08:05:00Z' }
];

/** What one share of a position is worth right now (a NO share is worth 1 - price). */
export function positionValue(entry: Position): number
{
    const outcome = marketById(entry.marketId).outcomes.find((candidate) => candidate.id === entry.outcomeId);
    const price = outcome?.price ?? 0;
    return entry.side === 'yes' ? price : 1 - price;
}

export function portfolioSummaryData(): PortfolioSummary
{
    const invested = POSITIONS.reduce((sum, entry) => sum + entry.shares * entry.avgPrice, 0);
    const current = POSITIONS.reduce((sum, entry) => sum + entry.shares * positionValue(entry), 0);
    return {
        balance: 1240.5,
        invested: Number(invested.toFixed(2)),
        current: Number(current.toFixed(2)),
        profit: Number((current - invested).toFixed(2)),
        profitToday: 18.4
    };
}

const LEADER_POOL = [
    'quietwhale', 'NoraTrades', 'TabrizBull', 'OracleFan', 'delta_hand',
    'SaraMkt', 'IntelligentQuantum', 'arman_v', 'MahsaK', 'kianoosh',
    'CyrusTrades', 'shervin_m', 'GoldenHand', 'NegarFX', 'polymath_ir',
    'BullOfBazaar', 'sina_dex', 'ParsaWins', 'moonlit_orca', 'AZTrader',
    'hoomanview', 'LadyLuck7', 'teh_bear', 'farzan_k', 'WhaleOfCaspian'
] as const;

const PERIOD_SCALE: Record<Period, number> = { day: 1, week: 5, month: 18, all: 90 };

export function leaderboardFor(period: Period): LeaderboardRow[]
{
    const random = mulberry32(hashSeed(`leaderboard/${ period }`));
    const scale = PERIOD_SCALE[period];
    return LEADER_POOL
        .map((name) => ({
            name,
            profit: Number((scale * (200 + random() * 4800)).toFixed(2)),
            volume: Math.round(scale * (2_000 + random() * 98_000))
        }))
        .sort((left, right) => right.profit - left.profit)
        .map((row, index) => ({ rank: index + 1, ...row }));
}
