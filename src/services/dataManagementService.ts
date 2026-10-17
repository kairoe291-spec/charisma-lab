import type { Repository } from '../data/repository';
import type { EntityRepository } from '../data/repositories/contracts';
import type { RecordPayloads } from '../domain/types';

type DataManagementPort = Pick<
  Repository,
  | 'exportBackup'
  | 'previewBackup'
  | 'importBackup'
  | 'clear'
  | 'listSafetyBackups'
  | 'getGuestMigrationState'
  | 'migrateGuestToAccount'
  | 'setGuestMigrationDecision'
  | 'listConflicts'
  | 'resolveConflict'
>;

/** Existing backup, migration and conflict operations, exposed without UI → Repository calls. */
export function createDataManagementService(
  repository: DataManagementPort,
  settings: EntityRepository<'appSettings'>,
) {
  return {
    exportBackup: (scope?: string) => repository.exportBackup(scope),
    previewBackup: (text: string) => repository.previewBackup(text),
    importBackup: (
      backup: Parameters<DataManagementPort['importBackup']>[0],
      mode: 'merge' | 'replace',
    ) => repository.importBackup(backup, mode),
    clear: () => repository.clear(),
    listSafetyBackups: () => repository.listSafetyBackups(),
    saveTheme: (theme: RecordPayloads['appSettings']['theme'], id?: string) =>
      settings.save({ theme }, id),
    getGuestMigrationState: () => repository.getGuestMigrationState(),
    migrateGuestToAccount: () => repository.migrateGuestToAccount(),
    setGuestMigrationDecision: (choice: 'merge' | 'keep' | 'cancel') =>
      repository.setGuestMigrationDecision(choice),
    exportGuestBackup: () => repository.exportBackup('guest'),
    listConflicts: () => repository.listConflicts(),
    resolveConflict: (id: string, choice: 'local' | 'remote' | 'merge', payload?: unknown) =>
      repository.resolveConflict(id, choice, payload),
  };
}
