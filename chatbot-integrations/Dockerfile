FROM node:22-bookworm-slim AS build

WORKDIR /app

# bookworm-slim has no OpenSSL; Prisma needs it to pick the correct query engine.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# prisma/ must be present before `npm ci` so the `postinstall` (prisma generate)
# and `npm run build` (prisma generate && tsc) can read the schema.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

# bookworm-slim has no OpenSSL; Prisma's query engine needs it at runtime.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install prod deps only. Skip lifecycle scripts so the prisma CLI (a devDep,
# omitted here) isn't required at install time; the generated Prisma client and
# query engine are copied from the build stage instead.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Generated Prisma client + query engine binary from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=build /app/dist ./dist
# Schema (for `prisma migrate deploy`) and static assets (product images).
COPY prisma ./prisma
COPY public ./public

EXPOSE 3000

CMD ["node", "dist/app/server.js"]
