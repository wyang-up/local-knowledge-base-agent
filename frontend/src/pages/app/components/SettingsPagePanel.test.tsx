import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {SettingsPagePanel} from './SettingsPagePanel';

describe('SettingsPagePanel', () => {
  it('renders confirmation dialog when active dialog exists', () => {
    render(
      <SettingsPagePanel
        draft={{ui: {language: 'zh', theme: 'light'}, providers: [], storage: {storagePath: './data/lance', documentStoragePath: './data/uploads'}}}
        activeProvider={'siliconflow'}
        providerLabelMap={{siliconflow: 'SiliconFlow'}}
        activeProviderDraft={null}
        activeProviderApiKey={''}
        providerModelsByProvider={{siliconflow: []}}
        fallbackProviderModelsMap={{siliconflow: []}}
        revealedProviderSet={new Set()}
        providerActionHint={''}
        vectorStorageHint={''}
        documentStorageHint={''}
        vectorStorageStatsText={'缓存占用: --'}
        docsStorageStatsText={'目录占用: --'}
        settingsController={{
          uiDirty: false,
          providerDirty: false,
          storageDirty: false,
          hasUnsavedChanges: false,
          inlineStatus: null,
          activeDialog: {
            title: '重置设置确认',
            description: '描述',
            confirmText: '确认',
            cancelText: '取消',
          },
          resolveCardMarker: () => ({text: '已同步', tone: 'success'}),
          setInlineStatus: vi.fn(),
          importSettings: vi.fn(),
          exportSettings: vi.fn(),
          queueDialog: vi.fn(),
          saveAllSettings: vi.fn(),
          closeActiveDialog: vi.fn(),
          resetAllDrafts: vi.fn(),
          requestProviderSwitch: vi.fn(),
        }}
        updateUiFieldWithImmediateSave={vi.fn()}
        updateProviderField={vi.fn()}
        updateStorageField={vi.fn()}
        pickStorageDirectory={vi.fn()}
        openStoragePath={vi.fn()}
        openDocumentStoragePath={vi.fn()}
        clearStorageCacheAction={vi.fn()}
        testProviderConnection={vi.fn()}
        toggleProviderApiKeyReveal={vi.fn()}
        copyProviderApiKey={vi.fn()}
      />,
    );

    expect(screen.getByText('重置设置确认')).toBeInTheDocument();
  });
});
