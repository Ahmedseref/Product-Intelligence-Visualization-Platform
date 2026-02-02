import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api, BackupSummary, RestorePreview, BackupSettingsData } from '../../client/api';
import { 
  Archive, 
  Download, 
  Upload, 
  RotateCcw, 
  Clock, 
  Database, 
  Users, 
  FolderTree, 
  Settings2, 
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Plus,
  FileArchive,
  HardDrive,
  Sliders
} from 'lucide-react';

type TriggerBadge = 'AUTO' | 'MANUAL' | 'SYSTEM';

const triggerColors: Record<TriggerBadge, string> = {
  AUTO: 'bg-blue-100 text-blue-800',
  MANUAL: 'bg-purple-100 text-purple-800',
  SYSTEM: 'bg-amber-100 text-amber-800',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function ConfirmModal({ isOpen, title, message, confirmText, confirmClass, onConfirm, onCancel, isLoading }: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <div className="text-gray-600">{message}</div>
        </div>
        <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 ${confirmClass || 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

interface StatusToastProps {
  type: 'success' | 'error' | 'info';
  message: string;
  onClose: () => void;
}

function StatusToast({ type, message, onClose }: StatusToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    error: <XCircle className="h-5 w-5 text-red-500" />,
    info: <AlertTriangle className="h-5 w-5 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${bgColors[type]}`}>
      {icons[type]}
      <span className="text-gray-800">{message}</span>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function BackupManager() {
  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<BackupSummary | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [createDescription, setCreateDescription] = useState('');
  const [backupSettings, setBackupSettings] = useState<BackupSettingsData>({ maxBackups: 50, autoBackupIntervalHours: 6 });
  const [editingSettings, setEditingSettings] = useState<BackupSettingsData>({ maxBackups: 50, autoBackupIntervalHours: 6 });
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      const [data, settings] = await Promise.all([api.listBackups(), api.getBackupSettings()]);
      setBackups(data);
      setBackupSettings(settings);
      setEditingSettings(settings);
    } catch (error) {
      setToast({ type: 'error', message: 'Failed to load backups' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleUpdateSettings = async () => {
    try {
      setActionLoading(true);
      const updated = await api.updateBackupSettings(editingSettings);
      setBackupSettings(updated);
      setShowSettingsModal(false);
      setToast({ type: 'success', message: 'Backup settings updated' });
    } catch (error) {
      setToast({ type: 'error', message: 'Failed to update settings' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setActionLoading(true);
      await api.createBackup(createDescription || 'Manual backup');
      setToast({ type: 'success', message: 'Backup created successfully' });
      setShowCreateModal(false);
      setCreateDescription('');
      fetchBackups();
    } catch (error) {
      setToast({ type: 'error', message: 'Failed to create backup' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreClick = async (backup: BackupSummary) => {
    try {
      setSelectedBackup(backup);
      setActionLoading(true);
      const preview = await api.getRestorePreview(backup.id);
      setRestorePreview(preview);
      setShowRestoreModal(true);
    } catch (error) {
      setToast({ type: 'error', message: 'Failed to load restore preview' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) return;
    try {
      setActionLoading(true);
      const result = await api.restoreBackup(selectedBackup.id);
      if (result.success) {
        setToast({ type: 'success', message: 'Backup restored successfully. Refresh page to see changes.' });
      } else {
        setToast({ type: 'error', message: result.message });
      }
      setShowRestoreModal(false);
      fetchBackups();
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to restore backup' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleExport = async (backup: BackupSummary) => {
    try {
      const blob = await api.exportBackup(backup.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_v${backup.versionNumber}_${new Date().toISOString().split('T')[0]}.backup`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setToast({ type: 'success', message: 'Backup exported successfully' });
    } catch (error) {
      setToast({ type: 'error', message: 'Failed to export backup' });
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setActionLoading(true);
      const result = await api.importBackup(file);
      if (result.success) {
        setToast({ type: 'success', message: result.message });
        fetchBackups();
      } else {
        setToast({ type: 'error', message: result.message });
      }
    } catch (error) {
      setToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to import backup' });
    } finally {
      setActionLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async () => {
    if (!selectedBackup) return;
    try {
      setActionLoading(true);
      await api.deleteBackup(selectedBackup.id);
      setToast({ type: 'success', message: 'Backup deleted successfully' });
      setShowDeleteModal(false);
      fetchBackups();
    } catch (error) {
      setToast({ type: 'error', message: 'Failed to delete backup' });
    } finally {
      setActionLoading(false);
    }
  };

  const totalSize = backups.reduce((acc, b) => acc + b.compressedSize, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Archive className="h-6 w-6 text-indigo-600" />
            Backup & Versioning
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage system backups with compression and point-in-time recovery
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".backup,.gz"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            Import
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create Backup
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-200 rounded-lg">
              <FileArchive className="h-5 w-5 text-indigo-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-indigo-900">{backups.length}</p>
              <p className="text-sm text-indigo-600">Total Backups</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-200 rounded-lg">
              <HardDrive className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-900">{formatBytes(totalSize)}</p>
              <p className="text-sm text-emerald-600">Storage Used</p>
            </div>
          </div>
        </div>
        <div 
          className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setEditingSettings(backupSettings);
            setShowSettingsModal(true);
          }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-200 rounded-lg">
              <Clock className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-900">{backupSettings.autoBackupIntervalHours}h</p>
              <p className="text-sm text-amber-600">Auto-backup Interval</p>
            </div>
            <Sliders className="h-4 w-4 text-amber-500 ml-auto" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : backups.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <Archive className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No backups yet</h3>
          <p className="text-gray-500 mb-4">Create your first backup to protect your data</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Create Backup
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {backups.map((backup, index) => (
            <div
              key={backup.id}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                      <span className="text-sm font-semibold text-indigo-700">v{backup.versionNumber}</span>
                    </div>
                    {index < backups.length - 1 && (
                      <div className="absolute left-1/2 top-10 w-0.5 h-8 bg-gray-200 -translate-x-1/2" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${triggerColors[backup.triggerType as TriggerBadge] || 'bg-gray-100 text-gray-800'}`}>
                        {backup.triggerType}
                      </span>
                      <span className="text-sm text-gray-500">{formatRelativeTime(backup.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{backup.description || 'No description'}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Database className="h-3 w-3" />
                        {backup.entityCounts.products || 0} products
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {backup.entityCounts.suppliers || 0} suppliers
                      </span>
                      <span className="flex items-center gap-1">
                        <FolderTree className="h-3 w-3" />
                        {backup.entityCounts.treeNodes || 0} nodes
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {formatBytes(backup.compressedSize)}
                        <span className="text-green-600">({backup.compressionRatio}% saved)</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExport(backup)}
                    className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Export backup"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleRestoreClick(backup)}
                    className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                    title="Restore backup"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedBackup(backup);
                      setShowDeleteModal(true);
                    }}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete backup"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={showCreateModal}
        title="Create New Backup"
        message={
          <div className="space-y-3">
            <p>This will create a snapshot of all your current data including products, suppliers, taxonomy, and settings.</p>
            <input
              type="text"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Backup description (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        }
        confirmText="Create Backup"
        onConfirm={handleCreateBackup}
        onCancel={() => {
          setShowCreateModal(false);
          setCreateDescription('');
        }}
        isLoading={actionLoading}
      />

      <ConfirmModal
        isOpen={showRestoreModal}
        title="Restore Backup"
        message={
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-lg">
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm">This will replace all current data with the backup. A safety backup will be created automatically.</p>
            </div>
            {restorePreview && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-gray-900 mb-2">Backup Contents:</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-gray-500" />
                    <span>{restorePreview.products} products</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-500" />
                    <span>{restorePreview.suppliers} suppliers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-gray-500" />
                    <span>{restorePreview.treeNodes} tree nodes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-gray-500" />
                    <span>{restorePreview.customFieldDefinitions} custom fields</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-gray-500" />
                    <span>{restorePreview.appSettings} settings</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        }
        confirmText="Restore Backup"
        confirmClass="bg-amber-600 hover:bg-amber-700"
        onConfirm={handleRestore}
        onCancel={() => {
          setShowRestoreModal(false);
          setRestorePreview(null);
        }}
        isLoading={actionLoading}
      />

      <ConfirmModal
        isOpen={showSettingsModal}
        title="Backup Settings"
        message={
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Auto-backup Interval (hours)
              </label>
              <select
                value={editingSettings.autoBackupIntervalHours}
                onChange={(e) => setEditingSettings({ ...editingSettings, autoBackupIntervalHours: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {[1, 2, 3, 4, 6, 8, 12, 24].map(h => (
                  <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">How often automatic backups are created</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Maximum Backups to Keep
              </label>
              <select
                value={editingSettings.maxBackups}
                onChange={(e) => setEditingSettings({ ...editingSettings, maxBackups: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {[10, 20, 30, 50, 75, 100].map(n => (
                  <option key={n} value={n}>{n} backups</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Older backups are automatically deleted when this limit is reached</p>
            </div>
          </div>
        }
        confirmText="Save Settings"
        onConfirm={handleUpdateSettings}
        onCancel={() => setShowSettingsModal(false)}
        isLoading={actionLoading}
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Backup"
        message={
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <p>Are you sure you want to delete this backup? This action cannot be undone.</p>
          </div>
        }
        confirmText="Delete"
        confirmClass="bg-red-600 hover:bg-red-700"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
        isLoading={actionLoading}
      />

      {toast && (
        <StatusToast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
