import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backup, SafetyBackup } from '../../domain/types';
import { BackupRestorePanel } from './BackupRestorePanel';
import { ClearGuestDataPanel } from './ClearGuestDataPanel';

const mocks = vi.hoisted(() => ({
  isAccount: false,
  records: [],
  flush: vi.fn<() => Promise<boolean>>(),
  notify: vi.fn(),
  perform: vi.fn(),
  listSafetyBackups: vi.fn(),
  previewBackup: vi.fn(),
  importBackup: vi.fn(),
  clear: vi.fn(),
  exportBackup: vi.fn(),
}));

vi.mock('../../hooks/useFeatureServices', () => ({
  useDataManagementService: () => ({
    listSafetyBackups: mocks.listSafetyBackups,
    previewBackup: mocks.previewBackup,
    importBackup: mocks.importBackup,
    clear: mocks.clear,
    exportBackup: mocks.exportBackup,
  }),
}));
vi.mock('../../hooks/useRecords', () => ({ useRecords: () => mocks.records }));
vi.mock('../../shared/feedback', () => ({
  useFeedback: () => ({ notify: mocks.notify, perform: mocks.perform }),
}));
vi.mock('../../services/saveCoordinator', () => ({ flushAllSaves: mocks.flush }));

const backup: Backup = {
  schemaVersion: 1,
  appVersion: '2.0.0-p1',
  exportedAt: '2026-10-17T08:00:00.000Z',
  records: [],
};
const snapshot: SafetyBackup = {
  id: 'snapshot-1',
  ownerScope: 'guest',
  reason: 'clear',
  createdAt: '2026-10-17T08:00:00.000Z',
  backup,
};

function uploadFile(text: string, size?: number) {
  const file = new File([text], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => text });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(screen.getByLabelText('上传 JSON 备份'), { target: { files: [file] } });
}

function Panels() {
  const [revision, setRevision] = useState(0);
  const changed = () => setRevision((current) => current + 1);
  return (
    <>
      <BackupRestorePanel
        isAccount={mocks.isAccount}
        snapshotRevision={revision}
        onDataChanged={changed}
      >
        <p>CSV panel slot</p>
      </BackupRestorePanel>
      <ClearGuestDataPanel isAccount={mocks.isAccount} onCleared={changed} />
    </>
  );
}

beforeEach(() => {
  mocks.isAccount = false;
  mocks.flush.mockReset().mockResolvedValue(true);
  mocks.notify.mockReset();
  mocks.perform.mockReset().mockImplementation(async (task: () => Promise<unknown>) => {
    await task();
    return true;
  });
  mocks.listSafetyBackups.mockReset().mockResolvedValue([]);
  mocks.previewBackup.mockReset().mockReturnValue(backup);
  mocks.importBackup.mockReset().mockResolvedValue({ added: 0, copied: 0, skipped: 0 });
  mocks.clear.mockReset().mockResolvedValue(undefined);
  mocks.exportBackup.mockReset().mockResolvedValue(backup);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Settings data workflows', () => {
  it('rejects oversized and invalid JSON before import without touching existing data', async () => {
    render(<Panels />);
    uploadFile('{}', 30 * 1024 * 1024 + 1);
    expect(mocks.notify).toHaveBeenCalledWith('备份文件超过 30 MB，请拆分或检查文件。', true);
    expect(mocks.previewBackup).not.toHaveBeenCalled();

    mocks.previewBackup.mockImplementationOnce(() => {
      throw new Error('备份不是有效的 JSON 文件。原有数据未改动。');
    });
    uploadFile('{broken');
    await waitFor(() =>
      expect(mocks.notify).toHaveBeenCalledWith('备份不是有效的 JSON 文件。原有数据未改动。', true),
    );
    expect(mocks.importBackup).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('requires exact confirmation and a successful pending-save flush before clearing', async () => {
    render(<Panels />);
    fireEvent.click(screen.getByRole('button', { name: '清空当前记录' }));
    const confirmButton = screen.getByRole('button', { name: '确认清空' });
    fireEvent.change(screen.getByLabelText('清空确认文字'), { target: { value: '清空 ' } });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('清空确认文字'), { target: { value: '清空' } });
    mocks.flush.mockResolvedValueOnce(false);
    fireEvent.click(confirmButton);
    await waitFor(() => expect(mocks.flush).toHaveBeenCalledOnce());
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith('还有未保存的编辑，请先重试保存。', true);
  });

  it('does not export or import a backup when pending edits cannot be saved', async () => {
    render(<Panels />);
    mocks.flush.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '一键导出 JSON' }));
    await waitFor(() => expect(mocks.flush).toHaveBeenCalledOnce());
    expect(mocks.exportBackup).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith('存在尚未保存的编辑，请重试保存后再备份。', true);

    uploadFile(JSON.stringify(backup));
    await screen.findByRole('dialog');
    mocks.flush.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }));
    await waitFor(() => expect(mocks.flush).toHaveBeenCalledTimes(2));
    expect(mocks.importBackup).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('keeps account-space clearing disabled and replace import unavailable', async () => {
    mocks.isAccount = true;
    render(<Panels />);
    expect(screen.getByRole('button', { name: '清空当前记录' })).toBeDisabled();
    uploadFile(JSON.stringify(backup));
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByRole('option', { name: /替换：/ })).toBeDisabled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('refreshes the safety snapshot list after both clear and import', async () => {
    let snapshots: SafetyBackup[] = [];
    mocks.listSafetyBackups.mockImplementation(async () => snapshots);
    mocks.clear.mockImplementation(async () => {
      snapshots = [snapshot];
    });
    mocks.importBackup.mockImplementation(async () => {
      snapshots = [snapshot, { ...snapshot, id: 'snapshot-2', reason: 'import-merge' }];
    });
    render(<Panels />);
    fireEvent.click(screen.getByRole('button', { name: '清空当前记录' }));
    fireEvent.change(screen.getByLabelText('清空确认文字'), { target: { value: '清空' } });
    fireEvent.click(screen.getByRole('button', { name: '确认清空' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '下载快照' })).toHaveLength(1),
    );
    uploadFile(JSON.stringify(backup));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: '下载快照' })).toHaveLength(2),
    );
    expect(mocks.flush).toHaveBeenCalledTimes(2);
  });
});
