# No credentials or database connection are needed at build time.
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
FROM dependencies AS build
COPY . .
RUN npm run build
FROM dependencies AS tools
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./
COPY ops/event-27-oct.json ./ops/event-27-oct.json
USER node
CMD ["npm", "run", "db:migrate"]
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
