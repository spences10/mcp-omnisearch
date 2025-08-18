export interface QueryCharacteristics {
	query_type: 'factual' | 'technical' | 'academic' | 'current_events' | 'code' | 'general' | 'local' | 'product' | 'definition' | 'how_to';
	domains_mentioned: string[];
	requires_recency: boolean;
	complexity: 'simple' | 'moderate' | 'complex';
	language: string;
	has_operators: boolean;
	sentiment: 'neutral' | 'investigative' | 'comparative';
	likely_intent: string;
	keywords: string[];
}

export interface ProviderScore {
	provider: string;
	score: number;
	reasons: string[];
}

class QueryAnalyzer {
	// Optimize for cold starts - use static readonly instead of complex initialization
	private static readonly COMMON_STOP_WORDS = new Set([
		'the', 'is', 'at', 'which', 'on', 'a', 'an', 'as', 'are', 'was',
		'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did',
		'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
		'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
		'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
		'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
		'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than',
		'too', 'very', 'just', 'in', 'for', 'of', 'to', 'from', 'with'
	]);

	// Keywords that indicate specific query types
	private readonly QUERY_TYPE_INDICATORS = {
		factual: ['what is', 'who is', 'when did', 'where is', 'facts about', 'definition of', 'meaning of'],
		technical: ['how to', 'debug', 'error', 'api', 'code', 'programming', 'software', 'algorithm', 'function', 'method', 'class', 'bug', 'fix', 'implement', 'configure', 'setup', 'install', 'docker', 'kubernetes', 'git'],
		academic: ['research', 'study', 'paper', 'journal', 'citation', 'thesis', 'academic', 'scholarly', 'peer review', 'publication', 'literature'],
		current_events: ['latest', 'recent', 'today', 'yesterday', 'news', 'current', '2024', '2025', 'breaking', 'update'],
		code: ['python', 'javascript', 'typescript', 'react', 'vue', 'angular', 'java', 'c++', 'rust', 'go', 'nodejs', 'npm', 'yarn', 'pip', 'cargo', 'maven'],
		general: ['best', 'top', 'review', 'compare', 'vs', 'versus', 'recommend', 'suggestion'],
		local: ['near me', 'nearby', 'local', 'in my area', 'close to'],
		product: ['buy', 'price', 'cost', 'cheap', 'expensive', 'deal', 'discount', 'shop', 'amazon', 'ebay'],
		definition: ['define', 'what is', 'what are', 'meaning', 'definition', 'explain'],
		how_to: ['how to', 'how do', 'how can', 'tutorial', 'guide', 'step by step', 'instructions']
	};

	// Provider strengths based on their known capabilities
	private readonly PROVIDER_STRENGTHS: Record<string, {
		strong_for: string[];
		good_with_domains: string[];
		recency_score: number;
		complexity_handling: number;
		operator_support: number;
		no_ads?: boolean;
		privacy_focused?: boolean;
		ai_powered?: boolean;
		fast_response?: boolean;
	}> = {
		tavily: {
			strong_for: ['factual', 'academic', 'definition', 'general'],
			good_with_domains: ['wikipedia.org', 'edu', 'gov', 'org'],
			recency_score: 0.8,
			complexity_handling: 0.9,
			operator_support: 0.7
		},
		kagi: {
			strong_for: ['technical', 'code', 'how_to', 'general'],
			good_with_domains: ['github.com', 'stackoverflow.com', 'dev.to', 'medium.com'],
			recency_score: 0.7,
			complexity_handling: 0.9,
			operator_support: 0.9,
			no_ads: true,
			privacy_focused: true
		},
		brave: {
			strong_for: ['general', 'current_events', 'technical'],
			good_with_domains: ['*'], // Works well with all domains
			recency_score: 0.8,
			complexity_handling: 0.7,
			operator_support: 0.9,
			privacy_focused: true
		},
		perplexity: {
			strong_for: ['complex', 'academic', 'factual', 'how_to'],
			good_with_domains: ['*'],
			recency_score: 0.9,
			complexity_handling: 1.0,
			operator_support: 0.6,
			ai_powered: true
		},
		kagi_fastgpt: {
			strong_for: ['general', 'factual', 'definition'],
			good_with_domains: ['*'],
			recency_score: 0.7,
			complexity_handling: 0.8,
			operator_support: 0.5,
			ai_powered: true,
			fast_response: true
		}
	};

	analyze_query(query: string): QueryCharacteristics {
		const query_lower = query.toLowerCase();
		const words = query_lower.split(/\s+/);
		
		// Detect query type
		const query_type = this.detect_query_type(query_lower);
		
		// Extract domains mentioned
		const domains_mentioned = this.extract_domains(query);
		
		// Check if query needs recent information
		const requires_recency = this.check_recency_requirement(query_lower);
		
		// Assess complexity
		const complexity = this.assess_complexity(query);
		
		// Check for search operators
		const has_operators = this.has_search_operators(query);
		
		// Detect sentiment/intent
		const sentiment = this.detect_sentiment(query_lower);
		
		// Extract key terms
		const keywords = this.extract_keywords(query_lower);
		
		// Determine likely intent
		const likely_intent = this.determine_intent(query_type, sentiment, keywords);

		return {
			query_type,
			domains_mentioned,
			requires_recency,
			complexity,
			language: 'en', // Could be enhanced with language detection
			has_operators,
			sentiment,
			likely_intent,
			keywords
		};
	}

	private detect_query_type(query: string): QueryCharacteristics['query_type'] {
		// Check each category and score them
		const scores: Record<string, number> = {};
		
		for (const [type, indicators] of Object.entries(this.QUERY_TYPE_INDICATORS)) {
			scores[type] = 0;
			for (const indicator of indicators) {
				if (query.includes(indicator)) {
					scores[type] += indicator.split(' ').length; // Weight by phrase length
				}
			}
		}
		
		// Find the highest scoring type
		let max_score = 0;
		let detected_type: QueryCharacteristics['query_type'] = 'general';
		
		for (const [type, score] of Object.entries(scores)) {
			if (score > max_score) {
				max_score = score;
				detected_type = type as QueryCharacteristics['query_type'];
			}
		}
		
		return detected_type;
	}

	private extract_domains(query: string): string[] {
		const domain_regex = /(?:site:|from:|on\s+|@)?([a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.)+[a-zA-Z]{2,}/g;
		const matches = query.match(domain_regex) || [];
		return [...new Set(matches.map(d => d.replace(/^(site:|from:|on\s+|@)/, '')))];
	}

	private check_recency_requirement(query: string): boolean {
		const recency_indicators = [
			'latest', 'recent', 'today', 'yesterday', 'current', 'now',
			'breaking', 'update', 'news', '2024', '2025', 'this week',
			'this month', 'this year', 'real-time', 'live'
		];
		
		return recency_indicators.some(indicator => query.includes(indicator));
	}

	private assess_complexity(query: string): QueryCharacteristics['complexity'] {
		const word_count = query.split(/\s+/).length;
		const has_multiple_clauses = /\s+(and|or|but|with|without|except)\s+/i.test(query);
		const has_comparison = /\s+(vs|versus|compare|better|worse|than)\s+/i.test(query);
		const has_multiple_questions = /\?.*\?/.test(query);
		
		let complexity_score = 0;
		
		if (word_count > 15) complexity_score += 2;
		else if (word_count > 8) complexity_score += 1;
		
		if (has_multiple_clauses) complexity_score += 1;
		if (has_comparison) complexity_score += 1;
		if (has_multiple_questions) complexity_score += 2;
		
		if (complexity_score >= 3) return 'complex';
		if (complexity_score >= 1) return 'moderate';
		return 'simple';
	}

	private has_search_operators(query: string): boolean {
		const operators = [
			'site:', 'intitle:', 'inurl:', 'filetype:', 'ext:',
			'-site:', 'before:', 'after:', 'related:', 'cache:',
			'"', 'AND', 'OR', 'NOT'
		];
		
		return operators.some(op => query.includes(op));
	}

	private detect_sentiment(query: string): QueryCharacteristics['sentiment'] {
		if (/\s+(vs|versus|compare|better|worse|difference)\s+/i.test(query)) {
			return 'comparative';
		}
		
		if (/\s+(why|how|investigate|analyze|understand|explain)\s+/i.test(query)) {
			return 'investigative';
		}
		
		return 'neutral';
	}

	private extract_keywords(query: string): string[] {
		const words = query.toLowerCase()
			.replace(/[^\w\s]/g, ' ')
			.split(/\s+/)
			.filter(word => word.length > 2 && !QueryAnalyzer.COMMON_STOP_WORDS.has(word));
		
		return [...new Set(words)];
	}

	private determine_intent(
		query_type: QueryCharacteristics['query_type'],
		sentiment: QueryCharacteristics['sentiment'],
		keywords: string[]
	): string {
		if (query_type === 'how_to') return 'learn_process';
		if (query_type === 'definition') return 'understand_concept';
		if (query_type === 'academic') return 'research';
		if (query_type === 'current_events') return 'stay_informed';
		if (query_type === 'product') return 'purchase_decision';
		if (query_type === 'technical' && keywords.some(k => ['error', 'bug', 'fix'].includes(k))) {
			return 'troubleshoot';
		}
		if (sentiment === 'comparative') return 'compare_options';
		if (sentiment === 'investigative') return 'deep_understanding';
		
		return 'general_information';
	}

	score_providers(characteristics: QueryCharacteristics, available_providers: string[]): ProviderScore[] {
		const scores: ProviderScore[] = [];
		
		for (const provider of available_providers) {
			const strength = this.PROVIDER_STRENGTHS[provider];
			if (!strength) continue;
			
			let score = 50; // Base score
			const reasons: string[] = [];
			
			// Score based on query type match
			if (strength.strong_for.includes(characteristics.query_type)) {
				score += 30;
				reasons.push(`Excellent for ${characteristics.query_type} queries`);
			} else if (characteristics.query_type === 'general') {
				score += 10;
			}
			
			// Score based on complexity handling
			if (characteristics.complexity === 'complex' && strength.complexity_handling >= 0.9) {
				score += 20;
				reasons.push('Handles complex queries well');
			} else if (characteristics.complexity === 'simple' && strength.fast_response) {
				score += 15;
				reasons.push('Fast for simple queries');
			}
			
			// Score based on recency needs
			if (characteristics.requires_recency && strength.recency_score >= 0.8) {
				score += 20;
				reasons.push('Good with recent information');
			}
			
			// Score based on operator support
			if (characteristics.has_operators && strength.operator_support >= 0.8) {
				score += 15;
				reasons.push('Strong operator support');
			}
			
			// Score based on domain expertise
			if (characteristics.domains_mentioned.length > 0) {
				for (const domain of characteristics.domains_mentioned) {
					if (strength.good_with_domains.includes('*') || 
						strength.good_with_domains.some(d => domain.includes(d))) {
						score += 10;
						reasons.push(`Good with ${domain}`);
						break;
					}
				}
			}
			
			// Special bonuses
			if (strength.ai_powered && characteristics.complexity === 'complex') {
				score += 10;
				reasons.push('AI-powered analysis');
			}
			
			if (strength.privacy_focused && characteristics.query_type !== 'academic') {
				score += 5;
				reasons.push('Privacy-focused');
			}
			
			if (strength.no_ads && characteristics.query_type === 'technical') {
				score += 10;
				reasons.push('No ads, clean results');
			}
			
			scores.push({ provider, score, reasons });
		}
		
		// Sort by score descending
		return scores.sort((a, b) => b.score - a.score);
	}

	get_recommended_provider(query: string, available_providers: string[]): {
		provider: string;
		confidence: number;
		reasoning: string;
		alternatives: string[];
	} {
		const characteristics = this.analyze_query(query);
		const scores = this.score_providers(characteristics, available_providers);
		
		if (scores.length === 0) {
			return {
				provider: available_providers[0] || '',
				confidence: 0,
				reasoning: 'No suitable provider found',
				alternatives: []
			};
		}
		
		const top_score = scores[0];
		const alternatives = scores.slice(1, 3).map(s => s.provider);
		
		// Calculate confidence (0-100)
		const confidence = Math.min(100, Math.max(0, top_score.score));
		
		// Build reasoning
		const reasoning = `Query type: ${characteristics.query_type}. ${top_score.reasons.join('. ')}.`;
		
		return {
			provider: top_score.provider,
			confidence,
			reasoning,
			alternatives
		};
	}
}

export const query_analyzer = new QueryAnalyzer();