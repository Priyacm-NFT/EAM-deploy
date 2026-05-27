import { db } from './client.js';
import { seedDatabase } from './seed.js';

const result = await seedDatabase(db);
console.log('Seed complete:', result);
process.exit(0);
