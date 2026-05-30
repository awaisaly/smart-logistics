FROM node:20-alpine
WORKDIR /app
RUN corepack enable
RUN corepack prepare pnpm@10.12.4 --activate
COPY package.json ./
RUN pnpm install --frozen-lockfile=false
COPY . .
EXPOSE 4005
CMD ["pnpm", "dev"]
