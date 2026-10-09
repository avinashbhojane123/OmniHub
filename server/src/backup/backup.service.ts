import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface BackupMeta {
  filename: string;
  timestamp: string;
  sizeBytes: number;
}

@Injectable()
export class BackupService {
  private readonly backupDir = path.resolve(__dirname, '../../backups');

  constructor() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async saveBackup(payload: any): Promise<{ filename: string; message: string }> {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid backup payload. Expected JSON object.');
    }
    if (!payload.version || !Array.isArray(payload.tasks)) {
      throw new BadRequestException('Invalid backup schema. Required "version" and "tasks" array.');
    }
    if (payload.categories && !Array.isArray(payload.categories)) {
      throw new BadRequestException('Invalid backup schema. "categories" must be an array.');
    }
    if (payload.habits && !Array.isArray(payload.habits)) {
      throw new BadRequestException('Invalid backup schema. "habits" must be an array.');
    }
    if (payload.goals && !Array.isArray(payload.goals)) {
      throw new BadRequestException('Invalid backup schema. "goals" must be an array.');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.json`;
    const filepath = path.join(this.backupDir, filename);

    await fs.promises.writeFile(filepath, JSON.stringify(payload, null, 2), 'utf-8');

    // Keep only the latest 30 backups to avoid disk exhaustion
    try {
      const files = await this.listBackups();
      if (files.length > 30) {
        files.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const toDelete = files.slice(0, files.length - 30);
        for (const item of toDelete) {
          await fs.promises.unlink(path.join(this.backupDir, item.filename));
        }
      }
    } catch {}

    return {
      filename,
      message: 'Backup successfully stored on companion server',
    };
  }

  async listBackups(): Promise<BackupMeta[]> {
    const rawFiles = await fs.promises.readdir(this.backupDir);
    const jsonFiles = rawFiles.filter((f) => f.endsWith('.json'));
    const metaList: BackupMeta[] = [];

    for (const file of jsonFiles) {
      const filePath = path.join(this.backupDir, file);
      const stats = await fs.promises.stat(filePath);
      if (stats.isFile()) {
        metaList.push({
          filename: file,
          timestamp: stats.mtime.toISOString(),
          sizeBytes: stats.size,
        });
      }
    }

    return metaList;
  }

  async getLatestBackup(): Promise<any | null> {
    const backups = await this.listBackups();
    if (backups.length === 0) return null;

    backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latestFile = path.join(this.backupDir, backups[0].filename);
    const raw = await fs.promises.readFile(latestFile, 'utf-8');
    return JSON.parse(raw);
  }
}
