import {
	apply_search_operators,
	parse_search_operators,
} from './search-operators.js';
import type { ProviderMetadata, SearchResult } from './types.js';

export const AUTO_LANGUAGE = 'auto';

export type LocaleSource = 'config' | 'param' | 'inferred';

export const LOCALE_AWARE_PROVIDERS = new Set([
	'brave',
	'tavily',
	'kagi',
]);

export const LANGUAGE_INFERENCE_MIN_MATCHES = 2;

const COUNTRY_ALIASES: Record<string, string> = {
	usa: 'us',
	'united states': 'us',
	uk: 'gb',
	'united kingdom': 'gb',
	'great britain': 'gb',
	austria: 'at',
	osterreich: 'at',
	österreich: 'at',
	germany: 'de',
	deutschland: 'de',
	switzerland: 'ch',
	schweiz: 'ch',
	france: 'fr',
	spain: 'es',
	españa: 'es',
	italy: 'it',
	italia: 'it',
	portugal: 'pt',
	netherlands: 'nl',
};

export const LOCATION_COUNTRY_HINTS: Record<string, string> = {
	wien: 'at',
	vienna: 'at',
	graz: 'at',
	salzburg: 'at',
	innsbruck: 'at',
	österreich: 'at',
	austria: 'at',
	berlin: 'de',
	münchen: 'de',
	munich: 'de',
	hamburg: 'de',
	frankfurt: 'de',
	deutschland: 'de',
	germany: 'de',
	zürich: 'ch',
	zurich: 'ch',
	schweiz: 'ch',
	switzerland: 'ch',
	paris: 'fr',
	lyon: 'fr',
	marseille: 'fr',
	france: 'fr',
	madrid: 'es',
	barcelona: 'es',
	españa: 'es',
	spain: 'es',
	rome: 'it',
	roma: 'it',
	milano: 'it',
	milan: 'it',
	italia: 'it',
	italy: 'it',
	lisbon: 'pt',
	lisboa: 'pt',
	portugal: 'pt',
	amsterdam: 'nl',
	rotterdam: 'nl',
	netherlands: 'nl',
	london: 'gb',
	manchester: 'gb',
	'united kingdom': 'gb',
	'new york': 'us',
	chicago: 'us',
	'san francisco': 'us',
	usa: 'us',
};

const LANGUAGE_INFERENCE_STOPWORDS: Record<string, Set<string>> = {
	en: new Set([
		'the',
		'and',
		'what',
		'how',
		'where',
		'when',
		'which',
		'who',
		'best',
		'near',
		'hours',
		'open',
		'with',
		'from',
		'for',
		'are',
		'is',
		'was',
		'does',
		'latest',
		'today',
		'new',
	]),
	de: new Set([
		'der',
		'die',
		'das',
		'und',
		'oder',
		'nicht',
		'ist',
		'sind',
		'ein',
		'eine',
		'einen',
		'mit',
		'für',
		'von',
		'wie',
		'wo',
		'was',
		'warum',
		'welche',
		'beste',
		'besten',
		'gibt',
		'öffnungszeiten',
		'heute',
		'morgen',
		'preis',
		'kaufen',
		'günstig',
		'nähe',
	]),
	es: new Set([
		'el',
		'los',
		'las',
		'una',
		'unos',
		'que',
		'qué',
		'cómo',
		'dónde',
		'cuál',
		'por',
		'para',
		'con',
		'mejores',
		'mejor',
		'cerca',
		'hoy',
		'horario',
		'horarios',
		'abierto',
		'abiertos',
		'tiendas',
		'restaurantes',
		'precio',
		'precios',
		'donde',
		'como',
	]),
	fr: new Set([
		'le',
		'les',
		'des',
		'une',
		'du',
		'où',
		'quel',
		'quelle',
		'quels',
		'quelles',
		'meilleur',
		'meilleure',
		'meilleurs',
		'meilleures',
		'horaires',
		'ouvert',
		'ouverts',
		'ouverture',
		'aujourd',
		'hui',
		'près',
		'proche',
		'avec',
		'pour',
		'prix',
		'cher',
		'que',
	]),
	it: new Set([
		'il',
		'lo',
		'gli',
		'che',
		'come',
		'dove',
		'quale',
		'quali',
		'migliori',
		'migliore',
		'orari',
		'orario',
		'aperto',
		'aperti',
		'vicino',
		'con',
		'oggi',
		'prezzo',
		'prezzi',
		'negozi',
		'ristoranti',
		'della',
		'delle',
	]),
	pt: new Set([
		'os',
		'do',
		'dos',
		'das',
		'um',
		'uma',
		'que',
		'como',
		'onde',
		'qual',
		'quais',
		'melhores',
		'melhor',
		'horários',
		'aberto',
		'perto',
		'hoje',
		'preço',
		'lojas',
		'com',
		'você',
		'para',
		'restaurantes',
	]),
	nl: new Set([
		'het',
		'een',
		'waar',
		'hoe',
		'welke',
		'beste',
		'goedkoop',
		'goedkoopste',
		'vandaag',
		'morgen',
		'openingstijden',
		'winkel',
		'winkels',
		'dichtbij',
		'buurt',
		'naar',
		'zijn',
		'niet',
		'voor',
	]),
};

const LANGUAGE_INFERENCE_CHAR_HINTS: Record<string, string> = {
	de: 'äöüß',
	es: 'ñ¿¡',
	pt: 'ãõ',
	fr: 'œ',
};

export interface LocaleEnv {
	country?: string;
	language?: string;
}

export interface LocaleInputs {
	query: string;
	param_country?: string;
	param_language?: string;
	config_country?: string;
	config_language?: string;
}

export interface ResolvedLocale {
	country?: string;
	language?: string;
	country_source?: LocaleSource;
	language_source?: LocaleSource;
	active: boolean;
}

const normalize_alias_key = (value: string) =>
	value
		.trim()
		.toLowerCase()
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ');

export const parse_country = (value?: string): string | undefined => {
	if (!value) return undefined;
	const normalized = normalize_alias_key(value);
	if (!normalized) return undefined;

	const aliased =
		COUNTRY_ALIASES[normalized] ?? LOCATION_COUNTRY_HINTS[normalized];
	if (aliased) return aliased;

	if (/^[a-z]{2}$/.test(normalized)) return normalized;
	return undefined;
};

export const parse_language = (
	value?: string,
): string | undefined => {
	if (!value) return undefined;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized === AUTO_LANGUAGE) return AUTO_LANGUAGE;
	if (/^[a-z]{2}$/.test(normalized)) return normalized;
	return undefined;
};

export const read_locale_env = (
	env: NodeJS.ProcessEnv = process.env,
): LocaleEnv => ({
	country: env.OMNISEARCH_COUNTRY,
	language: env.OMNISEARCH_LANGUAGE,
});

export const warn_invalid_locale_config = (
	env: NodeJS.ProcessEnv = process.env,
	warn: (message: string) => void = console.warn,
) => {
	const country = env.OMNISEARCH_COUNTRY?.trim();
	if (country && !parse_country(country)) {
		warn(
			`Warning: OMNISEARCH_COUNTRY="${country}" is not a valid ISO 3166-1 alpha-2 country code and will be ignored.`,
		);
	}

	const language = env.OMNISEARCH_LANGUAGE?.trim();
	if (language && !parse_language(language)) {
		warn(
			`Warning: OMNISEARCH_LANGUAGE="${language}" is not a valid ISO 639-1 language code or "auto" and will be ignored.`,
		);
	}
};

export const provider_supports_locale = (provider: string) =>
	LOCALE_AWARE_PROVIDERS.has(provider);

export const provider_applies_language = (provider: string) =>
	provider === 'brave' || provider === 'kagi';

export const detect_location_country = (
	query?: string,
): string | undefined => {
	if (!query) return undefined;
	const lowered = query.toLowerCase();
	const countries = new Set<string>();

	for (const [place, country] of Object.entries(
		LOCATION_COUNTRY_HINTS,
	)) {
		const escaped = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const pattern = new RegExp(
			`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`,
			'iu',
		);
		if (pattern.test(lowered)) countries.add(country);
	}

	return countries.size === 1 ? [...countries][0] : undefined;
};

export const infer_query_language = (
	query: string,
): string | undefined => {
	if (!query) return undefined;
	const lowered = query.toLowerCase();
	const words = new Set(lowered.match(/[\p{L}\p{N}_]+/gu) ?? []);
	const counts: Record<string, number> = {};

	for (const [language, stopwords] of Object.entries(
		LANGUAGE_INFERENCE_STOPWORDS,
	)) {
		let count = 0;
		for (const word of words) {
			if (stopwords.has(word)) count += 1;
		}
		for (const char of LANGUAGE_INFERENCE_CHAR_HINTS[language] ??
			'') {
			if (lowered.includes(char)) count += 1;
		}
		if (count) counts[language] = count;
	}

	const ranked = Object.entries(counts).sort(
		([left_lang, left_count], [right_lang, right_count]) =>
			right_count - left_count || left_lang.localeCompare(right_lang),
	);
	if (!ranked.length) return undefined;

	const [best_language, best_count] = ranked[0];
	if (best_count < LANGUAGE_INFERENCE_MIN_MATCHES) {
		return undefined;
	}
	if (ranked.length > 1 && ranked[1][1] === best_count) {
		return undefined;
	}
	return best_language;
};

export const to_tavily_country = (value: string): string => {
	const iso = parse_country(value);
	if (iso) {
		const name = new Intl.DisplayNames(['en'], {
			type: 'region',
		}).of(iso.toUpperCase());
		if (name && name.toLowerCase() !== iso) {
			return name.toLowerCase();
		}
	}

	return normalize_alias_key(value);
};

export const is_locale_active = (input: LocaleInputs): boolean =>
	Boolean(
		parse_country(input.param_country) ||
		parse_language(input.param_language) ||
		parse_country(input.config_country) ||
		parse_language(input.config_language),
	);

const pick_country = (
	input: LocaleInputs,
	operator_country?: string,
): Pick<ResolvedLocale, 'country' | 'country_source'> => {
	const from_param = parse_country(input.param_country);
	if (from_param) {
		return { country: from_param, country_source: 'param' };
	}

	const from_operator = parse_country(operator_country);
	if (from_operator) {
		return { country: from_operator, country_source: 'inferred' };
	}

	const from_hint = detect_location_country(input.query);
	if (from_hint) {
		return { country: from_hint, country_source: 'inferred' };
	}

	const from_config = parse_country(input.config_country);
	if (from_config) {
		return { country: from_config, country_source: 'config' };
	}

	return {};
};

const pick_language = (
	input: LocaleInputs,
	operator_language?: string,
): Pick<ResolvedLocale, 'language' | 'language_source'> => {
	const param_language = parse_language(input.param_language);
	if (param_language && param_language !== AUTO_LANGUAGE) {
		return { language: param_language, language_source: 'param' };
	}

	const from_operator = parse_language(operator_language);
	if (from_operator && from_operator !== AUTO_LANGUAGE) {
		return { language: from_operator, language_source: 'inferred' };
	}

	const config_language = parse_language(input.config_language);
	const use_auto =
		param_language === AUTO_LANGUAGE ||
		(param_language === undefined &&
			config_language === AUTO_LANGUAGE);

	if (use_auto) {
		const inferred = infer_query_language(input.query);
		if (inferred) {
			return { language: inferred, language_source: 'inferred' };
		}
		return {};
	}

	if (config_language && config_language !== AUTO_LANGUAGE) {
		return { language: config_language, language_source: 'config' };
	}

	return {};
};

export const resolve_search_locale = (
	input: LocaleInputs,
): ResolvedLocale => {
	const active = is_locale_active(input);
	if (!active) {
		return { active: false };
	}

	const operators = apply_search_operators(
		parse_search_operators(input.query),
	);
	const country = pick_country(input, operators.location);
	const language = pick_language(input, operators.language);

	return {
		active: true,
		...country,
		...language,
	};
};

export const locale_query_language = (
	locale: ResolvedLocale,
): string | undefined =>
	locale.language && locale.language !== AUTO_LANGUAGE
		? locale.language
		: undefined;

export const locale_metadata_for_provider = (
	provider: string,
	locale: ResolvedLocale,
): ProviderMetadata | undefined => {
	if (!provider_supports_locale(provider) || !locale.active) {
		return undefined;
	}

	const country = locale.country;
	const language = provider_applies_language(provider)
		? locale_query_language(locale)
		: undefined;

	if (!country && !language) return undefined;

	const source: Record<string, LocaleSource> = {};
	if (country && locale.country_source) {
		source.country = locale.country_source;
	}
	if (language && locale.language_source) {
		source.language = locale.language_source;
	}

	return {
		locale: {
			...(country ? { country } : {}),
			...(language ? { language } : {}),
			source,
		},
	};
};

export const with_locale_metadata = (
	results: SearchResult[],
	provider: string,
	locale: ResolvedLocale,
): SearchResult[] => {
	const extra = locale_metadata_for_provider(provider, locale);
	if (!extra) return results;

	return results.map((result) => ({
		...result,
		metadata: {
			...result.metadata,
			...extra,
		},
	}));
};
