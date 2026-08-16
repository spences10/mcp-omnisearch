import { validate_api_key } from '../../../common/validation.js';

export const keenable_is_public = (
	api_key: string | undefined,
	allow_public: boolean,
) => !api_key?.trim() && allow_public;

export const keenable_headers = (
	provider: string,
	api_key: string | undefined,
	allow_public: boolean,
	extra: Record<string, string> = {},
): Record<string, string> => {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		...extra,
	};

	if (keenable_is_public(api_key, allow_public)) {
		return headers;
	}

	headers['X-API-Key'] = validate_api_key(api_key, provider);
	return headers;
};

export const keenable_search_url = (base_url: string) =>
	`${base_url}/v1/search`;

export const keenable_search_public_url = (base_url: string) =>
	`${base_url}/v1/search/public`;

export const keenable_fetch_url = (base_url: string, url: string) =>
	`${base_url}/v1/fetch?url=${encodeURIComponent(url)}`;

export const keenable_fetch_public_url = (
	base_url: string,
	url: string,
) => `${base_url}/v1/fetch/public?url=${encodeURIComponent(url)}`;

export const keenable_endpoint = (
	api_key: string | undefined,
	allow_public: boolean,
	keyed: string,
	public_url: string,
) => (keenable_is_public(api_key, allow_public) ? public_url : keyed);
