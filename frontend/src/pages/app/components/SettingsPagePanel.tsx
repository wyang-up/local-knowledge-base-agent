import ConfirmDialog from '../../../features/settings/components/ConfirmDialog';
import ModelConfigCard from '../../../features/settings/components/ModelConfigCard';
import SettingsLayout from '../../../features/settings/components/SettingsLayout';
import StorageCard from '../../../features/settings/components/StorageCard';
import UIPreferencesCard from '../../../features/settings/components/UIPreferencesCard';

type SettingsPagePanelProps = {
  draft: any;
  activeProvider: string;
  providerLabelMap: Record<string, string>;
  activeProviderDraft: any;
  activeProviderApiKey: string;
  providerModelsByProvider: Record<string, any[]>;
  fallbackProviderModelsMap: Record<string, any[]>;
  revealedProviderSet: Set<string>;
  providerActionHint: string;
  vectorStorageHint: string;
  documentStorageHint: string;
  vectorStorageStatsText: string;
  docsStorageStatsText: string;
  settingsController: any;
  updateUiFieldWithImmediateSave: (field: 'language' | 'theme', value: string) => void;
  updateProviderField: (providerId: string, field: string, value: string) => void;
  updateStorageField: (field: 'storagePath' | 'documentStoragePath', value: string) => void;
  pickStorageDirectory: (field: 'storagePath' | 'documentStoragePath') => void;
  openStoragePath: () => void;
  openDocumentStoragePath: () => void;
  clearStorageCacheAction: () => void;
  testProviderConnection: () => void;
  toggleProviderApiKeyReveal: () => void;
  copyProviderApiKey: () => void;
};

export function SettingsPagePanel({
  draft,
  activeProvider,
  providerLabelMap,
  activeProviderDraft,
  activeProviderApiKey,
  providerModelsByProvider,
  fallbackProviderModelsMap,
  revealedProviderSet,
  providerActionHint,
  vectorStorageHint,
  documentStorageHint,
  vectorStorageStatsText,
  docsStorageStatsText,
  settingsController,
  updateUiFieldWithImmediateSave,
  updateProviderField,
  updateStorageField,
  pickStorageDirectory,
  openStoragePath,
  openDocumentStoragePath,
  clearStorageCacheAction,
  testProviderConnection,
  toggleProviderApiKeyReveal,
  copyProviderApiKey,
}: SettingsPagePanelProps) {
  const uiMarker = settingsController.resolveCardMarker('ui', settingsController.uiDirty);
  const providerMarker = settingsController.resolveCardMarker('provider', settingsController.providerDirty);
  const storageMarker = settingsController.resolveCardMarker('storage', settingsController.storageDirty);

  return (
    <div className="flex-1 overflow-auto">
      <SettingsLayout
        language={draft.ui.language as 'zh' | 'en'}
        theme={draft.ui.theme as 'light' | 'dark'}
        onImportClick={() => settingsController.setInlineStatus({tone: 'info', message: draft.ui.language === 'en' ? 'Select a configuration file to import' : '请选择配置文件导入'})}
        onImportFile={settingsController.importSettings}
        onExport={settingsController.exportSettings}
        onReset={() => settingsController.queueDialog({
          id: 'reset-confirm',
          priority: 'confirm',
          title: draft.ui.language === 'en' ? 'Reset settings' : '重置设置确认',
          description: draft.ui.language === 'en' ? 'This restores defaults and clears all unsaved edits.' : '将恢复默认设置，并清空当前未保存编辑。',
          confirmText: draft.ui.language === 'en' ? 'Reset now' : '确认重置',
          onConfirm: settingsController.resetAllDrafts,
        })}
        showSaveBar={settingsController.hasUnsavedChanges}
        onSaveAll={settingsController.saveAllSettings}
        bannerTone={settingsController.inlineStatus?.tone ?? null}
        bannerMessage={settingsController.inlineStatus?.message ?? ''}
      >
        <UIPreferencesCard
          appLanguage={draft.ui.language as 'zh' | 'en'}
          appTheme={draft.ui.theme as 'light' | 'dark'}
          language={draft.ui.language as 'zh' | 'en'}
          theme={draft.ui.theme as 'light' | 'dark'}
          stateText={uiMarker.text}
          stateTone={uiMarker.tone}
          onLanguageChange={(value) => updateUiFieldWithImmediateSave('language', value)}
          onThemeChange={(value) => updateUiFieldWithImmediateSave('theme', value)}
        />
        <ModelConfigCard
          appLanguage={draft.ui.language as 'zh' | 'en'}
          appTheme={draft.ui.theme as 'light' | 'dark'}
          activeProvider={activeProvider as any}
          providers={(Object.keys(providerLabelMap)).map((id) => ({id, label: providerLabelMap[id]})) as any}
          baseUrl={activeProviderDraft?.baseUrl ?? ''}
          apiKey={activeProviderApiKey}
          llmModel={activeProviderDraft?.llmModel ?? ''}
          embeddingModel={activeProviderDraft?.embeddingModel ?? ''}
          stateText={providerMarker.text}
          stateTone={providerMarker.tone}
          models={providerModelsByProvider[activeProvider] ?? fallbackProviderModelsMap[activeProvider] ?? []}
          isApiKeyRevealed={revealedProviderSet.has(activeProvider)}
          providerActionHint={providerActionHint}
          onProviderSwitch={settingsController.requestProviderSwitch}
          onBaseUrlChange={(value) => updateProviderField(activeProvider, 'baseUrl', value)}
          onApiKeyChange={(value) => updateProviderField(activeProvider, 'apiKey', value)}
          onLlmModelChange={(value) => updateProviderField(activeProvider, 'llmModel', value)}
          onEmbeddingModelChange={(value) => updateProviderField(activeProvider, 'embeddingModel', value)}
          onTestConnection={testProviderConnection}
          onToggleApiKeyReveal={toggleProviderApiKeyReveal}
          onCopyApiKey={copyProviderApiKey}
        />
        <div>
          <StorageCard
            appLanguage={draft.ui.language as 'zh' | 'en'}
            appTheme={draft.ui.theme as 'light' | 'dark'}
            vectorStoragePath={draft.storage.storagePath}
            documentStoragePath={draft.storage.documentStoragePath}
            stateText={storageMarker.text}
            stateTone={storageMarker.tone}
            onVectorPathChange={(value) => updateStorageField('storagePath', value)}
            onDocumentPathChange={(value) => updateStorageField('documentStoragePath', value)}
            onPickVectorDirectory={() => pickStorageDirectory('storagePath')}
            onPickDocumentDirectory={() => pickStorageDirectory('documentStoragePath')}
            onOpenVectorStorage={openStoragePath}
            onOpenDocumentStorage={openDocumentStoragePath}
            onClearVectorCache={clearStorageCacheAction}
            vectorStatsText={vectorStorageStatsText}
            documentStatsText={docsStorageStatsText}
            vectorHint={vectorStorageHint}
            documentHint={documentStorageHint}
          />
        </div>
      </SettingsLayout>
      <ConfirmDialog
        open={Boolean(settingsController.activeDialog)}
        title={settingsController.activeDialog?.title ?? ''}
        description={settingsController.activeDialog?.description ?? ''}
        confirmText={settingsController.activeDialog?.confirmText ?? (draft.ui.language === 'en' ? 'Confirm' : '确认')}
        cancelText={settingsController.activeDialog?.cancelText ?? (draft.ui.language === 'en' ? 'Cancel' : '取消')}
        onConfirm={() => {
          Promise.resolve(settingsController.activeDialog?.onConfirm?.()).finally(() => {
            settingsController.closeActiveDialog();
          });
        }}
        onCancel={() => {
          Promise.resolve(settingsController.activeDialog?.onCancel?.()).finally(() => {
            settingsController.closeActiveDialog();
          });
        }}
      />
    </div>
  );
}
