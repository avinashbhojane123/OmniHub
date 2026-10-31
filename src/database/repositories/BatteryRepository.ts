import { getDatabase } from '../connection';

export interface BatterySessionRecord {
  id: string;
  startTime: string;
  endTime?: string | null;
  startLevel: number;
  endLevel?: number | null;
  gained: number;
  durationMinutes: number;
  chargingType: string;
  peakTemperature: number;
  peakWattage: number;
  avgSpeedPerHour: number;
  completed: number; // 0 = active, 1 = completed
}

class BatteryRepository {
  private static instance: BatteryRepository;

  public static getInstance(): BatteryRepository {
    if (!BatteryRepository.instance) {
      BatteryRepository.instance = new BatteryRepository();
    }
    return BatteryRepository.instance;
  }

  public async startSession(
    startLevel: number,
    chargingType: string
  ): Promise<BatterySessionRecord> {
    const db = await getDatabase();
    const id = `session_${Date.now()}`;
    const startTime = new Date().toISOString();

    // Mark any existing dangling session as completed
    await db.execute(
      `UPDATE battery_sessions SET completed = 1 WHERE completed = 0`
    );

    await db.execute(
      `INSERT INTO battery_sessions (
        id, startTime, startLevel, gained, durationMinutes,
        chargingType, peakTemperature, peakWattage, avgSpeedPerHour, completed
      ) VALUES (?, ?, ?, 0, 0, ?, 0, 0, 0, 0)`,
      [id, startTime, startLevel, chargingType]
    );

    return {
      id,
      startTime,
      startLevel,
      gained: 0,
      durationMinutes: 0,
      chargingType,
      peakTemperature: 0,
      peakWattage: 0,
      avgSpeedPerHour: 0,
      completed: 0,
    };
  }

  public async getActiveSession(): Promise<BatterySessionRecord | null> {
    const db = await getDatabase();
    const res = await db.execute(
      `SELECT * FROM battery_sessions WHERE completed = 0 ORDER BY startTime DESC LIMIT 1`
    );
    if (!res.rows || res.rows.length === 0) return null;
    return res.rows[0] as BatterySessionRecord;
  }

  public async updateActiveSession(
    currentLevel: number,
    temperature: number,
    wattage: number
  ): Promise<void> {
    const db = await getDatabase();
    const active = await this.getActiveSession();
    if (!active) return;

    const startTimeMs = new Date(active.startTime).getTime();
    const nowMs = Date.now();
    const durationMinutes = Math.max(1, Math.round((nowMs - startTimeMs) / 60000));
    const gained = Math.max(0, currentLevel - active.startLevel);
    const speed = durationMinutes > 0 ? (gained / (durationMinutes / 60)) : 0;
    const avgSpeedPerHour = Math.round(speed * 10) / 10;
    const peakTemperature = Math.max(active.peakTemperature || 0, temperature || 0);
    const peakWattage = Math.max(active.peakWattage || 0, wattage || 0);

    await db.execute(
      `UPDATE battery_sessions SET
        gained = ?,
        durationMinutes = ?,
        peakTemperature = ?,
        peakWattage = ?,
        avgSpeedPerHour = ?
      WHERE id = ?`,
      [gained, durationMinutes, peakTemperature, peakWattage, avgSpeedPerHour, active.id]
    );
  }

  public async finishActiveSession(endLevel: number): Promise<BatterySessionRecord | null> {
    const db = await getDatabase();
    const active = await this.getActiveSession();
    if (!active) return null;

    const endTime = new Date().toISOString();
    const startTimeMs = new Date(active.startTime).getTime();
    const durationMinutes = Math.max(1, Math.round((Date.now() - startTimeMs) / 60000));
    const gained = Math.max(0, endLevel - active.startLevel);
    const speed = durationMinutes > 0 ? (gained / (durationMinutes / 60)) : 0;
    const avgSpeedPerHour = Math.round(speed * 10) / 10;

    await db.execute(
      `UPDATE battery_sessions SET
        endTime = ?,
        endLevel = ?,
        gained = ?,
        durationMinutes = ?,
        avgSpeedPerHour = ?,
        completed = 1
      WHERE id = ?`,
      [endTime, endLevel, gained, durationMinutes, avgSpeedPerHour, active.id]
    );

    return {
      ...active,
      endTime,
      endLevel,
      gained,
      durationMinutes,
      avgSpeedPerHour,
      completed: 1,
    };
  }

  public async getRecentSessions(limit: number = 10): Promise<BatterySessionRecord[]> {
    const db = await getDatabase();
    const res = await db.execute(
      `SELECT * FROM battery_sessions WHERE completed = 1 ORDER BY startTime DESC LIMIT ?`,
      [limit]
    );
    return (res.rows || []) as BatterySessionRecord[];
  }
}

export const batteryRepository = BatteryRepository.getInstance();
