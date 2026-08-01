// The ONE locale authority: which language is active, which direction that implies, and the
// `t()` lookup every component uses. Direction and `lang` are stamped on <html> here and
// nowhere else, so the document, Tailwind's logical properties, and the fonts all switch from
// a single write. Persisted so a returning visitor keeps their choice.

import { createStore, createSignal, type Getter } from 'azerothjs';

import { readSetting, writeSetting } from '../lib/storage.ts';

import { en } from '../i18n/en.ts';
import { fa } from '../i18n/fa.ts';

export type Lang = 'en' | 'fa';
export type Dir = 'ltr' | 'rtl';

/** The dictionary shape both languages must satisfy - en is the source of truth. */
export type Dictionary = typeof en;

/** Dot-path keys of the dictionary (one level of nesting, which is all we use). */
export type MessageKey = {
    [Section in keyof Dictionary & string]: {
        [Key in keyof Dictionary[Section] & string]: `${ Section }.${ Key }`;
    }[keyof Dictionary[Section] & string];
}[keyof Dictionary & string];

const DICTIONARIES: Record<Lang, Dictionary> = { en, fa };
const STORAGE_KEY = 'auctionhouse.lang';

function initialLang(): Lang
{
    const saved = readSetting(STORAGE_KEY);
    return saved === 'fa' ? 'fa' : 'en';
}

/** Stamps lang/dir on the document. The flip is INSTANT by design: an animated RTL mirror
 *  reads as breakage, so a one-frame `dir-flipping` class suppresses every transition. */
function stamp(lang: Lang): void
{
    if (typeof document === 'undefined')
    {
        return;
    }
    const root = document.documentElement;
    root.classList.add('dir-flipping');
    root.lang = lang;
    root.dir = lang === 'fa' ? 'rtl' : 'ltr';
    requestAnimationFrame(() => root.classList.remove('dir-flipping'));
}

export interface LocaleApi
{
    /** The active language, reactively. */
    lang: Getter<Lang>;

    /** The active direction, derived from the language. */
    dir: () => Dir;

    /** Switches the language, restamps the document, persists the choice. */
    setLang(next: Lang): void;

    /** Looks a message up by `section.key`; falls back to English, then to the key itself. */
    t(key: MessageKey): string;

    /** Picks the active language's variant of a bilingual wire string (market titles, rules). */
    text(localized: { en: string; fa: string }): string;
}

export const useLocale = createStore((): LocaleApi =>
{
    const [lang, setLangSignal] = createSignal<Lang>(initialLang());
    stamp(lang());

    return {
        lang,
        dir: () => (lang() === 'fa' ? 'rtl' : 'ltr'),
        setLang: (next) =>
        {
            setLangSignal(next);
            stamp(next);
            writeSetting(STORAGE_KEY, next);
        },
        t: (key) =>
        {
            const [section, name] = key.split('.') as [keyof Dictionary, string];
            const active = DICTIONARIES[lang()][section] as Record<string, string>;
            const fallback = en[section] as Record<string, string>;
            return active[name] ?? fallback[name] ?? key;
        },
        text: (localized) => localized[lang()]
    };
});
