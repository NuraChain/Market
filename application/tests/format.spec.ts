// Where Persian-digit bugs die. Every assertion pins an exact rendered string, because the
// failure mode in this domain is a mixed-script or mis-signed number that LOOKS plausible.
import { describe, it, expect } from 'vitest';

import
{
    faDigits,
    formatMoney,
    formatVolume,
    formatPercent,
    formatPrice,
    formatSigned,
    formatDate,
    formatDateTimeShort,
    formatDateTime,
    DISPLAY_TOMAN_PER_USD
} from '../src/i18n/format.ts';

describe('faDigits', () =>
{
    it('maps every Latin digit to its Persian twin', () =>
    {
        expect(faDigits('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹');
    });

    it('swaps the separators too - Persian thousands and decimal marks', () =>
    {
        expect(faDigits('1,234.5')).toBe('۱٬۲۳۴٫۵');
    });

    it('leaves non-numeric text alone', () =>
    {
        expect(faDigits('تومان $ abc')).toBe('تومان $ abc');
    });
});

describe('formatPrice - the dual price convention', () =>
{
    it('en renders cents', () =>
    {
        expect(formatPrice(0.34, 'en')).toBe('34¢');
    });

    it('fa renders the same cents in Persian digits', () =>
    {
        expect(formatPrice(0.34, 'fa')).toBe('۳۴¢');
    });

    it('rounds sub-cent prices instead of showing decimals', () =>
    {
        expect(formatPrice(0.666, 'en')).toBe('67¢');
    });
});

describe('formatPercent', () =>
{
    it('en renders a trailing percent sign', () =>
    {
        expect(formatPercent(0.34, 'en')).toBe('34%');
    });

    it('fa renders the Arabic sign leading in logical order', () =>
    {
        expect(formatPercent(0.34, 'fa')).toBe('٪۳۴');
    });
});

describe('formatMoney', () =>
{
    it('en groups full amounts', () =>
    {
        expect(formatMoney(12400, 'en')).toBe('$12,400');
    });

    it('en shows both cents once an amount is fractional', () =>
    {
        expect(formatMoney(1240.5, 'en')).toBe('$1,240.50');
        expect(formatMoney(73.528, 'en')).toBe('$73.53');
    });

    it('en compacts when asked', () =>
    {
        expect(formatMoney(1_240_000, 'en', { compact: true })).toBe('$1.2M');
    });

    it('fa converts to Toman and speaks in scale words, not digit walls', () =>
    {
        expect(formatMoney(10, 'fa')).toBe('۹۰۰ هزار تومان');
    });

    it('fa crosses into millions and billions with Persian decimals', () =>
    {
        expect(formatMoney(100, 'fa')).toBe('۹ میلیون تومان');
        expect(formatMoney(25_000, 'fa')).toBe('۲٫۳ میلیارد تومان');
    });

    it('fa keeps small amounts as grouped Persian digits', () =>
    {
        expect(formatMoney(0.005, 'fa')).toBe('۴۵۰ تومان');
    });
});

describe('formatVolume', () =>
{
    it('en is always compact', () =>
    {
        expect(formatVolume(3_400_000, 'en')).toBe('$3.4M');
        expect(formatVolume(870, 'en')).toBe('$870');
    });

    it('fa mirrors the money scale words', () =>
    {
        expect(formatVolume(3_400_000, 'fa')).toBe('۳۰۶ میلیارد تومان');
    });
});

describe('formatSigned - profit and loss', () =>
{
    it('gains carry a plus', () =>
    {
        expect(formatSigned(1250, 'en')).toBe('+$1.3K');
    });

    it('losses carry a true minus sign, not a hyphen', () =>
    {
        expect(formatSigned(-40, 'en')).toBe('−$40');
    });

    it('zero carries no sign', () =>
    {
        expect(formatSigned(0, 'en')).toBe('$0');
    });

    it('fa signs sit on Persian-digit Toman amounts', () =>
    {
        expect(formatSigned(-10, 'fa')).toBe('−۹۰۰ هزار تومان');
    });
});

describe('formatDate', () =>
{
    it('en renders the Gregorian date', () =>
    {
        expect(formatDate('2026-12-31T00:00:00Z', 'en')).toBe('Dec 31, 2026');
    });

    it('fa renders the Jalali calendar in Persian digits', () =>
    {
        const rendered = formatDate('2026-12-31T00:00:00Z', 'fa');
        expect(rendered).toContain('۱۴۰۵');
        expect(rendered).not.toMatch(/[0-9]/);
    });

    it('the card chip form carries the numeric date AND the clock', () =>
    {
        const rendered = formatDateTimeShort('2026-12-31T12:30:00Z', 'en');
        expect(rendered).toContain('12/31/2026');
        expect(rendered).toMatch(/\d{1,2}:\d{2}\s[AP]M/);
        const persian = formatDateTimeShort('2026-12-31T12:30:00Z', 'fa');
        expect(persian).toContain('۱۴۰۵');
        expect(persian).toMatch(/[۰-۹]{2}:[۰-۹]{2}/);
        expect(persian).not.toMatch(/[0-9]/);
    });

    it('the deadline form carries the clock', () =>
    {
        const rendered = formatDateTime('2026-12-31T16:30:00Z', 'en');
        expect(rendered).toContain('Dec 31, 2026');
        expect(rendered).toMatch(/\d{1,2}:\d{2}/);
        const persian = formatDateTime('2026-12-31T16:30:00Z', 'fa');
        expect(persian).toContain('۱۴۰۵');
        expect(persian).toContain(':');
    });
});

describe('the display rate', () =>
{
    it('is the single number a real FX feed replaces', () =>
    {
        expect(DISPLAY_TOMAN_PER_USD).toBe(90_000);
    });
});
