export const delay = (ms: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

export const retry_with_backoff = async <T>(
	fn: () => Promise<T>,
	max_retries: number = 3,
	initial_delay: number = 1000,
): Promise<T> => {
	let retries = 0;
	while (true) {
		try {
			return await fn();
		} catch (error) {
			if (retries >= max_retries) {
				throw error;
			}
			const delay_time = initial_delay * Math.pow(2, retries);
			await delay(delay_time);
			retries++;
		}
	}
};
