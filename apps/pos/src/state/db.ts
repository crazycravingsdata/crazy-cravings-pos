import { PosDatabase } from '../db/schema';

/** Instância única do banco local do tablet. */
export const db = new PosDatabase();
