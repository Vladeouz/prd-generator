// Satu sumber jam di server (PRD bagian 3): timestamp ISO 8601 UTC. Disuntikkan ke modul yang
// menyimpan waktu agar test bisa memakai jam tetap.
export type Clock = () => string;

export const systemClock: Clock = () => new Date().toISOString();
