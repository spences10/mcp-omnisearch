# Use Node.js 20 LTS Alpine for smallest image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies including Python and uv
RUN apk add --no-cache python3 py3-pip gettext && \
    pip3 install --break-system-packages uv

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY . .

# Build the TypeScript project
RUN pnpm run build

# Remove development dependencies to reduce image size
RUN pnpm prune --prod

# Create MCPO config file
RUN echo '{\
  "mcpServers": {\
    "omnisearch": {\
      "command": "node",\
      "args": ["dist/index.js"],\
      "env": {\
        "BRAVE_API_KEY": "${BRAVE_API_KEY}",\
        "TAVILY_API_KEY": "${TAVILY_API_KEY}",\
        "KAGI_API_KEY": "${KAGI_API_KEY}",\
        "PERPLEXITY_API_KEY": "${PERPLEXITY_API_KEY}",\
        "JINA_AI_API_KEY": "${JINA_AI_API_KEY}",\
        "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}"\
      }\
    }\
  }\
}' > /app/mcpo-config.json

# Create startup script file
RUN printf '#!/bin/sh\n# Substitute environment variables in config\nenvsubst < /app/mcpo-config.json > /app/mcpo-config-final.json\n\n# Start MCPO with the config\nexec uv tool run mcpo --port ${PORT:-8000} --config /app/mcpo-config-final.json\n' > /app/start.sh && \
    chmod +x /app/start.sh

# Expose port for MCPO
EXPOSE 8000

# Set environment to production
ENV NODE_ENV=production

# Run the startup script
CMD ["/app/start.sh"]