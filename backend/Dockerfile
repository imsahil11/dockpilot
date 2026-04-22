FROM node:20
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .
RUN npm run db:generate
RUN npm run build
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
