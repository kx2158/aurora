/**
 * Automatic safety copies of the whole database (game log, time together, online times, everything).
 * One copy per day, the newest 30 are kept in Documents\Neon-backups\auto.
 */
import sqliteService from './sqlite.js';

const KEEP = 30;

export async function backupDatabase() {
    try {
        const dir = await AppApi.GetNeonBackupFolder(KEEP);
        if (!dir) return;
        const day = new Date().toISOString().slice(0, 10);
        const file = `${dir}\\Neon-${day}.sqlite3`.replaceAll("'", "''");
        // VACUUM INTO makes a consistent copy even while the app is running. It refuses to overwrite,
        // so a second start on the same day just does nothing.
        await sqliteService.executeNonQuery(`VACUUM INTO '${file}'`);
    } catch (e) {
        console.warn('Neon backup skipped', e?.message || e);
    }
}
