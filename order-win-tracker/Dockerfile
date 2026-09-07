FROM oven/bun:1.2.22-alpine AS dependencies
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.base.json biome.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/drishti/package.json packages/drishti/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS application
COPY . .
RUN bun run check && bun run test
EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/api", "start"]
