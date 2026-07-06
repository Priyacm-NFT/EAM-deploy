import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgresql://eam:eam@127.0.0.1:5432/eam';
const sql = postgres(url, { connect_timeout: 10 });

try {
  const rows = await sql`select 1 as ok`;
  console.log('OK', rows);
} catch (e) {
  console.error('FAIL', e.message, e.code);
  process.exitCode = 1;
} finally {
  await sql.end();
}
