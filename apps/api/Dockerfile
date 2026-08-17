FROM node:24.15.0-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm deploy --filter api --prod /out

FROM node:24.15.0-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /out ./

USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
