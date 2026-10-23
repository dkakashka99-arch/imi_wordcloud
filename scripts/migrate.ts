import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Pool} from 'pg';
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
try {await migrate(drizzle(pool),{migrationsFolder:'drizzle'});} finally {await pool.end();}
