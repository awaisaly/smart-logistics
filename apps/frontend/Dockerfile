FROM node:20-alpine
WORKDIR /app
RUN corepack enable
RUN corepack prepare pnpm@10.12.4 --activate
COPY package.json ./
RUN pnpm install --frozen-lockfile=false
COPY . .
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "5173"]
