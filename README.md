# mcp-omnisearch

🚀 **A powerful Model Context Protocol (MCP) server with intelligent search orchestration, automatic provider fallback, and advanced query analysis.**

This server provides unified access to multiple search providers (Tavily, Brave, Kagi, Perplexity, Jina AI, Firecrawl) with smart provider selection, robust error handling, and seamless fallback capabilities.

<a href="https://glama.ai/mcp/servers/gz5wgmptd8">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/gz5wgmptd8/badge" alt="Glama badge" />
</a>

## 🆕 What's New in v0.0.8

### ✨ Intelligent Search Orchestration
- **Smart Provider Selection**: Automatic provider selection based on query analysis
- **Robust Fallback**: When one provider fails (rate limits, errors), automatically tries others
- **Performance Learning**: System learns from usage patterns to optimize provider selection
- **Query Analysis**: Understands query type (technical, academic, factual) and selects best provider

### 🔄 Dual Operating Modes
- **Direct Mode** (default): Traditional individual provider tools - full backward compatibility
- **Unified Mode**: Single search interface with intelligent provider selection and fallback

### 🛠️ MCP Optimization
- **On-Demand Ready**: Optimized for stdio, HTTP, and SSE transports
- **State Persistence**: Maintains provider health and performance data across restarts
- **Memory Efficient**: Automatic memory management for resource-constrained environments
- **Cold Start Optimized**: Fast startup times for on-demand execution

### 📊 Advanced Monitoring
- **Provider Health Tracking**: Circuit breakers, rate limit detection, automatic recovery
- **Performance Analytics**: Success rates, response times, trending analysis
- **Adaptive Ranking**: Provider selection improves based on actual performance

## 🎯 Key Features

### 🧠 Intelligent Provider Selection

The system automatically analyzes your queries and selects the best provider:

```typescript
// "How to fix React useState error" → Automatically chooses Kagi (technical)
// "Latest AI research papers 2024" → Automatically chooses Tavily (academic + recent)
// "What is quantum computing" → Automatically chooses Perplexity (complex factual)
```

### 🔄 Automatic Fallback & Recovery

Never lose a search due to provider issues:
- **Rate Limits**: Automatically switches to alternative providers
- **API Errors**: Circuit breaker pattern prevents repeated failures
- **Credit Exhaustion**: 24-hour cooldown with fallback to other providers
- **Performance Issues**: Real-time provider health monitoring

### 📈 Learning & Optimization

The system continuously improves:
- **Success Rate Tracking**: Monitors provider performance by query type
- **Response Time Analysis**: Optimizes for speed and reliability
- **Adaptive Selection**: Provider ranking improves based on your usage patterns

## 🚀 Quick Start

### Option 1: Unified Mode (Recommended)
Single search interface with automatic provider selection:

```bash
export OMNISEARCH_MODE="unified"
export TAVILY_API_KEY="your-key"
export KAGI_API_KEY="your-key"
```

Available tools:
- `unified_search` - Intelligent search with automatic fallback
- `unified_ai_search` - AI-powered search with provider optimization

### Option 2: Direct Mode (Default)
Individual provider control with fallback tools available:

```bash
# Default mode - no configuration needed
export TAVILY_API_KEY="your-key"
export KAGI_API_KEY="your-key"
```

Available tools: All individual provider tools + unified tools

## 🔧 Configuration

### MCP Client Setup

#### Claude Desktop / Cline
```json
{
  "mcpServers": {
    "mcp-omnisearch": {
      "command": "node",
      "args": ["/path/to/mcp-omnisearch/dist/index.js"],
      "env": {
        "OMNISEARCH_MODE": "unified",
        "TAVILY_API_KEY": "your-tavily-key",
        "KAGI_API_KEY": "your-kagi-key",
        "PERPLEXITY_API_KEY": "your-perplexity-key",
        "BRAVE_API_KEY": "your-brave-key",
        "JINA_AI_API_KEY": "your-jina-key",
        "FIRECRAWL_API_KEY": "your-firecrawl-key"
      }
    }
  }
}
```

#### Advanced Configuration
```bash
# Provider Selection
export OMNISEARCH_MODE="unified"                    # unified|direct
export OMNISEARCH_PROVIDER_ORDER="kagi,tavily,brave" # Custom provider priority
export OMNISEARCH_DISABLED_PROVIDERS="brave"        # Disable specific providers

# Fallback Behavior  
export OMNISEARCH_FALLBACK_ENABLED="true"          # Enable automatic fallback
export OMNISEARCH_FALLBACK_DELAY_MS="500"          # Delay between attempts

# Performance Tuning
export OMNISEARCH_CIRCUIT_BREAKER_THRESHOLD="3"    # Failures before circuit opens
export OMNISEARCH_CIRCUIT_BREAKER_TIMEOUT_MS="300000" # 5min circuit breaker timeout
```

### 🔑 API Keys

**Flexible Requirements**: You don't need all API keys! The server automatically detects available providers.

**Required for Basic Functionality** (choose one or more):
- `TAVILY_API_KEY` - Best for factual/academic queries
- `KAGI_API_KEY` - Best for technical/privacy-focused queries  
- `BRAVE_API_KEY` - Best for general/current events

**Optional Enhancements**:
- `PERPLEXITY_API_KEY` - AI-powered comprehensive responses
- `JINA_AI_API_KEY` - Content processing and fact verification
- `FIRECRAWL_API_KEY` - Advanced web scraping and crawling

**Self-Hosted Options**:
- `FIRECRAWL_BASE_URL` - Use your own Firecrawl instance

## 🛠️ Advanced Tools

### 🔍 Search Tools

#### Unified Search (Recommended)
```json
{
  "tool": "unified_search",
  "arguments": {
    "query": "latest developments in quantum computing",
    "limit": 10
  }
}
```

**Automatic Features**:
- Query type detection (technical, academic, factual, etc.)
- Provider selection based on query characteristics
- Automatic fallback on failures
- Performance tracking and optimization

#### AI-Powered Search
```json
{
  "tool": "unified_ai_search", 
  "arguments": {
    "query": "Explain the differences between REST and GraphQL"
  }
}
```

#### Individual Provider Tools
```json
// Direct provider access (still available)
{"tool": "tavily_search", "arguments": {"query": "research topic"}}
{"tool": "kagi_search", "arguments": {"query": "technical docs"}}
{"tool": "brave_search", "arguments": {"query": "current events"}}
```

### 📊 Monitoring & Management

#### Provider Health Status
```json
{
  "tool": "provider_health"
}
```

Returns:
- Provider availability status
- Rate limit information  
- Circuit breaker status
- Recent performance trends

#### Performance Analytics
```json
{
  "tool": "performance_insights"
}
```

Returns:
- Success rates by provider and query type
- Response time statistics
- Best performing providers
- Performance trends and recommendations

#### Query Analysis
```json
{
  "tool": "analyze_query",
  "arguments": {
    "query": "how to implement OAuth2 in Node.js"
  }
}
```

Returns:
- Query type classification
- Recommended provider with confidence score
- Provider scoring breakdown
- Alternative provider suggestions

#### Configuration Management
```json
// Switch modes
{"tool": "set_mode", "arguments": {"mode": "unified"}}

// Configure provider order
{
  "tool": "configure_providers",
  "arguments": {
    "provider_order": ["kagi", "tavily", "brave"],
    "fallback_enabled": true
  }
}

// Reset provider health
{"tool": "reset_provider_health", "arguments": {"provider_name": "tavily"}}
```

### 📄 Content Processing Tools

#### Multi-Provider Content Extraction
```json
{
  "tool": "tavily_extract_process",
  "arguments": {
    "url": ["https://example.com/doc1", "https://example.com/doc2"],
    "extract_depth": "advanced"
  }
}
```

#### Firecrawl Advanced Features
```json
// Deep site crawling
{
  "tool": "firecrawl_crawl_process",
  "arguments": {
    "url": "https://docs.example.com",
    "extract_depth": "advanced"
  }
}

// Structured data extraction
{
  "tool": "firecrawl_extract_process", 
  "arguments": {
    "url": "https://example.com",
    "extract_depth": "basic"
  }
}

// Interactive page processing
{
  "tool": "firecrawl_actions_process",
  "arguments": {
    "url": "https://dynamic-content-site.com",
    "extract_depth": "advanced"
  }
}
```

## 🔄 Search Operators & Filtering

### Universal Parameters
All search tools support:
- `query` (required): Search query
- `limit` (optional): Maximum results (1-50)
- `include_domains` (optional): Limit to specific domains
- `exclude_domains` (optional): Exclude specific domains

### Advanced Search Operators

#### Brave & Kagi (Query String Operators)
```json
{
  "query": "filetype:pdf site:microsoft.com typescript guide -site:github.com"
}
```

#### Tavily (API Parameters)
```json
{
  "query": "typescript guide",
  "include_domains": ["microsoft.com", "typescriptlang.org"],
  "exclude_domains": ["github.com"]
}
```

**Supported Operators**:
- `site:domain.com` - Include domain
- `-site:domain.com` - Exclude domain  
- `filetype:pdf` - File type filter
- `intitle:keyword` - Title contains keyword
- `inurl:keyword` - URL contains keyword
- `before:2024` - Date filtering
- `after:2023` - Date filtering
- `"exact phrase"` - Exact phrase matching

## 🚀 Deployment Options

### Local MCP (stdio)
```bash
npm install -g mcp-omnisearch
# Configure in your MCP client
```

### Docker Container
```bash
# Quick start
docker run -d \
  -p 8000:8000 \
  -e OMNISEARCH_MODE=unified \
  -e TAVILY_API_KEY=your-key \
  -e KAGI_API_KEY=your-key \
  --name mcp-omnisearch \
  ghcr.io/spences10/mcp-omnisearch:latest
```

### Docker Compose
```yaml
version: '3.8'
services:
  mcp-omnisearch:
    image: ghcr.io/spences10/mcp-omnisearch:latest
    ports:
      - "8000:8000"
    environment:
      OMNISEARCH_MODE: unified
      TAVILY_API_KEY: ${TAVILY_API_KEY}
      KAGI_API_KEY: ${KAGI_API_KEY}
      PERPLEXITY_API_KEY: ${PERPLEXITY_API_KEY}
```

### Cloud Deployment
Works with any container platform:
- Google Cloud Run
- AWS ECS/Fargate  
- Azure Container Instances
- Railway, Render, Fly.io
- Kubernetes clusters

## 📱 Usage Examples

### Research Assistant
```json
// Automatic provider selection for different query types
{"tool": "unified_search", "arguments": {"query": "latest climate change research papers 2024"}}
// → Chooses Tavily (academic + recent)

{"tool": "unified_search", "arguments": {"query": "how to implement WebSocket authentication in Node.js"}}
// → Chooses Kagi (technical)

{"tool": "unified_search", "arguments": {"query": "breaking news artificial intelligence"}}
// → Chooses Brave (current events)
```

### Content Analysis Pipeline
```json
// 1. Search for relevant sources
{"tool": "unified_search", "arguments": {"query": "sustainable energy solutions"}}

// 2. Extract content from found URLs
{"tool": "tavily_extract_process", "arguments": {"url": ["url1", "url2", "url3"]}}

// 3. Enhance with AI analysis
{"tool": "unified_ai_search", "arguments": {"query": "analyze current sustainable energy trends"}}

// 4. Verify key facts
{"tool": "jina_grounding_enhance", "arguments": {"statement": "Solar energy costs decreased 70% since 2010"}}
```

## 🔧 MCP Environment Optimization

### Automatic Environment Detection
The system automatically optimizes based on how it's running:

**stdio (On-Demand)**:
- Memory limit: 50MB
- History: 100 records  
- Fast state persistence
- Cold start optimization

**HTTP/SSE (Persistent)**:
- Memory limit: 200MB
- History: 1000 records
- Background monitoring
- Full feature set

### Environment Variables
```bash
# Explicit transport override
export OMNISEARCH_TRANSPORT=stdio|http|sse

# State management
export OMNISEARCH_STATE_DIR=/custom/path
export OMNISEARCH_FORCE_PERSISTENCE=true

# Memory optimization
export OMNISEARCH_MEMORY_MONITORING=true
export OMNISEARCH_MAX_HISTORY=100
```

## 📊 Performance & Monitoring

### Real-Time Analytics
Monitor your search performance:
- Success rates by provider
- Average response times
- Query type analysis
- Provider health trends

### Intelligent Optimization
The system continuously learns:
- Which providers work best for your query types
- Optimal provider ordering for your usage patterns
- Automatic adjustment based on performance data

### Health Monitoring
- Circuit breaker protection
- Rate limit detection and recovery
- Automatic provider health scoring
- Performance trend analysis

## 🛟 Troubleshooting

### Common Issues

#### No Providers Available
```bash
# Check API keys
echo $TAVILY_API_KEY
# Verify at least one provider is configured

# Check provider health
{"tool": "provider_health"}
```

#### Rate Limiting
```bash
# The system handles this automatically, but you can:
# 1. Check provider health
{"tool": "provider_health"}

# 2. Reset provider if needed  
{"tool": "reset_provider_health", "arguments": {"provider_name": "tavily"}}

# 3. Configure alternative providers
export OMNISEARCH_PROVIDER_ORDER="kagi,brave,tavily"
```

#### Performance Issues
```bash
# Check performance insights
{"tool": "performance_insights"}

# Analyze specific queries
{"tool": "analyze_query", "arguments": {"query": "your query"}}

# Optimize provider order
{"tool": "configure_providers", "arguments": {"provider_order": ["fastest_provider", "backup_provider"]}}
```

### Debug Mode
```bash
export OMNISEARCH_LOG_ENVIRONMENT=true
export OMNISEARCH_MEMORY_MONITORING=true
# Check logs for environment detection and optimization
```

## 🤝 Contributing

We welcome contributions! Please see our [contributing guidelines](CONTRIBUTING.md).

### Development Setup
```bash
git clone https://github.com/spences10/mcp-omnisearch.git
cd mcp-omnisearch
pnpm install
pnpm run build
pnpm run dev
```

## 📚 Documentation

- [Provider Configuration Guide](PROVIDER_CONFIGURATION.md) - Complete configuration reference
- [Mode Configuration Guide](MODE_CONFIGURATION.md) - Direct vs Unified modes
- [MCP Optimization Guide](MCP_OPTIMIZATION.md) - On-demand execution optimization
- [Improvements Summary](IMPROVEMENTS.md) - Technical implementation details

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with:
- [Model Context Protocol](https://github.com/modelcontextprotocol) - MCP SDK and standards
- [Tavily Search](https://tavily.com) - Academic and factual search
- [Kagi Search](https://kagi.com) - Privacy-focused, high-quality search
- [Brave Search](https://search.brave.com) - Privacy-focused search engine
- [Perplexity AI](https://perplexity.ai) - AI-powered comprehensive responses  
- [Jina AI](https://jina.ai) - Content processing and fact verification
- [Firecrawl](https://firecrawl.dev) - Advanced web scraping and crawling

---

**🚀 Ready to supercharge your search capabilities?** Install mcp-omnisearch and experience intelligent search orchestration with automatic fallback and continuous optimization!