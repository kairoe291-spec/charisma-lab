import Dexie, { type Table } from 'dexie';
import type { SupportedStorage } from '@supabase/supabase-js';
import type { CloudConfig } from './config';

interface DeviceSetting { key: string; config: CloudConfig }
interface AuthState { projectId: string; generation: number }
interface AuthItem { projectId: string; key: string; generation: number; value: string }

/** Tokens and public device configuration never enter business records or JSON backups. */
export class CloudDeviceDatabase extends Dexie {
  settings!: Table<DeviceSetting, string>;
  authState!: Table<AuthState, string>;
  authItems!: Table<AuthItem, [string, string]>;
  constructor(name = 'charisma-lab-cloud-device') {
    super(name);
    this.version(1).stores({ settings: 'key', authState: 'projectId', authItems: '[projectId+key], projectId' });
  }
  async getConfig(): Promise<CloudConfig | null> { return (await this.settings.get('active'))?.config ?? null; }
  async saveConfig(config: CloudConfig): Promise<void> { await this.settings.put({ key: 'active', config }); }
  async storage(projectId: string): Promise<IndexedDbAuthStorage> {
    const generation = await this.transaction('rw', this.authState, async () => {
      const current = await this.authState.get(projectId);
      if (current) return current.generation;
      await this.authState.put({ projectId, generation: 0 });
      return 0;
    });
    return new IndexedDbAuthStorage(this, projectId, generation);
  }
  /** A stale refresh request cannot restore a session after logout. */
  async revoke(projectId: string): Promise<void> {
    await this.transaction('rw', this.authState, this.authItems, async () => {
      const current = await this.authState.get(projectId);
      await this.authState.put({ projectId, generation: (current?.generation ?? 0) + 1 });
      await this.authItems.where('projectId').equals(projectId).delete();
    });
  }
}

export class IndexedDbAuthStorage implements SupportedStorage {
  constructor(private database: CloudDeviceDatabase, readonly projectId: string, readonly generation: number) {}
  async getItem(key: string): Promise<string | null> {
    return this.database.transaction('r', this.database.authState, this.database.authItems, async () => {
      if ((await this.database.authState.get(this.projectId))?.generation !== this.generation) return null;
      const item = await this.database.authItems.get([this.projectId, key]);
      return item?.generation === this.generation ? item.value : null;
    });
  }
  async setItem(key: string, value: string): Promise<void> {
    await this.database.transaction('rw', this.database.authState, this.database.authItems, async () => {
      if ((await this.database.authState.get(this.projectId))?.generation !== this.generation) return;
      await this.database.authItems.put({ projectId: this.projectId, key, generation: this.generation, value });
    });
  }
  async removeItem(key: string): Promise<void> {
    await this.database.transaction('rw', this.database.authState, this.database.authItems, async () => {
      if ((await this.database.authState.get(this.projectId))?.generation === this.generation) {
        await this.database.authItems.delete([this.projectId, key]);
      }
    });
  }
  async isCurrent(): Promise<boolean> { return (await this.database.authState.get(this.projectId))?.generation === this.generation; }
}

export const cloudDeviceDatabase = new CloudDeviceDatabase();
