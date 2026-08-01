// THE number module. Every price, percentage, volume, and date in the UI renders through
// these functions - components never call Intl or toLocaleString themselves, which is the
// rule that keeps Persian and Latin digits from ever mixing in one view.
//
// The locale contract (decided with the product owner):
//   en - Latin digits, $ amounts, compact volumes ($1.2M).
//   fa - Persian-Arabic digits, Toman amounts converted at a DISPLAY rate, Persian scale
//        words (هزار/میلیون/میلیارد). Charts opt out via the .latin-nums utility instead of
//        calling different functions.
//
// Platform amounts are USD-denominated numbers in the data; the Toman conversion is a fixed
// presentation rate for the UI phase (a real FX feed replaces DISPLAY_TOMAN_PER_USD later,
// nothing else moves).

import type { Lang } from '../stores/locale.store.ts';

/** UI-phase presentation rate; the single number a real FX feed will replace. */
export const DISPLAY_TOMAN_PER_USD = 90_000;

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

/** Latin -> Persian-Arabic digits, with the Persian separators (٬ thousands, ٫ decimal). */
export function faDigits(text: string): string
{
    let out = '';
    for (const ch of text)
    {
        if (ch >= '0' && ch <= '9')
        {
            out += FA_DIGITS[ch.charCodeAt(0) - 48];
        }
        else if (ch === ',')
        {
            out += '٬';
        }
        else if (ch === '.')
        {
            out += '٫';
        }
        else
        {
            out += ch;
        }
    }
    return out;
}

function group(value: number): string
{
    return new Intl.NumberFormat('en-US').format(value);
}

/** Grouped money body: whole dollars stay clean ($12,400), fractional show both cents ($1,240.50). */
function groupMoney(value: number): string
{
    const rounded = Math.round(value * 100) / 100;
    return new Intl.NumberFormat
    ('en-US',
        Number.isInteger(rounded)
            ? { maximumFractionDigits: 0 }
            : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rounded);
}

/**
 * A money amount. en: `$12,400` / compact `$1.2M` when asked. fa: converted to Toman and
 * spoken with Persian scale words - `۸۶۸ هزار تومان` - because a nine-digit Toman figure is
 * noise where a magnitude is the message.
 */
export function formatMoney(usd: number, lang: Lang, options: { compact?: boolean } = {}): string
{
    if (lang === 'fa')
    {
        const toman = Math.round(usd * DISPLAY_TOMAN_PER_USD);
        return `${ faScale(toman) } تومان`;
    }
    if (options.compact === true)
    {
        return `$${ compact(usd) }`;
    }
    return `$${ groupMoney(usd) }`;
}

/** A traded-volume amount: always compact, always labeled by the caller. */
export function formatVolume(usd: number, lang: Lang): string
{
    if (lang === 'fa')
    {
        return `${ faScale(Math.round(usd * DISPLAY_TOMAN_PER_USD)) } تومان`;
    }
    return `$${ compact(usd) }`;
}

/** en `1.2M`; the shared compaction. */
function compact(value: number): string
{
    if (value >= 1_000_000_000)
    {
        return `${ trim(value / 1_000_000_000) }B`;
    }
    if (value >= 1_000_000)
    {
        return `${ trim(value / 1_000_000) }M`;
    }
    if (value >= 1_000)
    {
        return `${ trim(value / 1_000) }K`;
    }
    return group(Math.round(value));
}

/** fa compaction with Persian scale words and Persian digits. */
function faScale(value: number): string
{
    if (value >= 1_000_000_000)
    {
        return `${ faDigits(trim(value / 1_000_000_000)) } میلیارد`;
    }
    if (value >= 1_000_000)
    {
        return `${ faDigits(trim(value / 1_000_000)) } میلیون`;
    }
    if (value >= 1_000)
    {
        return `${ faDigits(trim(value / 1_000)) } هزار`;
    }
    return faDigits(group(Math.round(value)));
}

/** One decimal, trailing zero dropped: 1.0 -> "1", 1.24 -> "1.2". */
function trim(value: number): string
{
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** A probability as a percentage: en `34%`; fa the Arabic sign leading in logical order (`٪۳۴`), which RTL renders as `۳۴٪`. */
export function formatPercent(share: number, lang: Lang): string
{
    const value = Math.round(share * 100);
    return lang === 'fa' ? `٪${ faDigits(String(value)) }` : `${ value }%`;
}

/**
 * The DUAL price display that fixes the cents-vs-percent confusion: one convention,
 * everywhere - `34¢` with the chance rendered beside it by the caller. fa keeps the cent
 * frame (the platform currency) in Persian digits: `۳۴¢`.
 */
export function formatPrice(share: number, lang: Lang): string
{
    const cents = Math.round(share * 100);
    return lang === 'fa' ? `${ faDigits(String(cents)) }¢` : `${ cents }¢`;
}

/** A signed profit/loss amount with its sign rendered locale-correctly. */
export function formatSigned(usd: number, lang: Lang): string
{
    const sign = usd > 0 ? '+' : usd < 0 ? '−' : '';
    const body = formatMoney(Math.abs(usd), lang, { compact: true });
    return `${ sign }${ body }`;
}

/** Relative time for feeds: en `2h ago`, fa `۲ ساعت پیش`. Coarse on purpose - a trade feed
 *  needs magnitude, not seconds. `now` is injectable so tests never race the clock. */
export function formatTimeAgo(iso: string, lang: Lang, now: number = Date.now()): string
{
    const minutes = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
    if (minutes < 60)
    {
        return lang === 'fa' ? `${ faDigits(String(minutes)) } دقیقه پیش` : `${ minutes }m ago`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24)
    {
        return lang === 'fa' ? `${ faDigits(String(hours)) } ساعت پیش` : `${ hours }h ago`;
    }
    const days = Math.round(hours / 24);
    return lang === 'fa' ? `${ faDigits(String(days)) } روز پیش` : `${ days }d ago`;
}

/** A resolution date: en `Dec 31, 2026`; fa the Persian (Jalali) calendar via Intl. */
export function formatDate(iso: string, lang: Lang): string
{
    const date = new Date(iso);
    if (lang === 'fa')
    {
        return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(date);
    }
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

/** A resolve deadline WITH its clock time - deadlines are hours-precise on a prediction
 *  market. en `Dec 31, 2026, 4:00 PM`; fa the Jalali date with the ۲۴h clock. */
export function formatDateTime(iso: string, lang: Lang): string
{
    const date = new Date(iso);
    if (lang === 'fa')
    {
        return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** The card timer chip: the numeric deadline WITH its clock - resolution is hours-precise,
 *  so the card must not hide the time. en `12/31/2026 4:00 PM`; fa the numeric Jalali date
 *  with the ۲۴h clock (`۱۴۰۵/۱۰/۱۰ ۲۰:۰۰`). */
export function formatDateTimeShort(iso: string, lang: Lang): string
{
    const date = new Date(iso);
    if (lang === 'fa')
    {
        const day = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
        const clock = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(date);
        return `${ day } ${ clock }`;
    }
    const day = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
    const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
    return `${ day } ${ clock }`;
}
