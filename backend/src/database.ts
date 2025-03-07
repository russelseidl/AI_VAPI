import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://russelseidl:Random57@localhost:5432/orders_db',
});

export const query = async (text: string, params?: any[]) => {
    try {
        return await pool.query(text, params);
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};