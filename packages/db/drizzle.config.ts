import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // Compiled output: drizzle-kit cannot resolve NodeNext `.js` imports against `.ts` sources.
  schema: './dist/schema/index.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://eam:eam@localhost:5432/eam',
  },
});
