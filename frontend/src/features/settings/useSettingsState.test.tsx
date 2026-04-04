import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSettingsState, type SaveOperation, type UseSettingsStateApi } from './useSettingsState.ts';
import type { ProviderId, SettingsDraft } from './types.ts';

function createInitialDraft(): SettingsDraft {
  return {
    ui: { language: 'zh-CN', theme: 'system' },
    providers: [
      {
        providerId: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-1234567890abcdef',
        llmModel: 'gpt-4o-mini',
        embeddingModel: 'text-embedding-3-small',
      },
    ],
    storage: {
      storagePath: '/tmp/kb',
      documentStoragePath: '/tmp/kb-docs',
    },
  };
}

function expectOperation(
  operation: SaveOperation | null,
  expected: {
    module?: SaveOperation['module'];
    providerId?: ProviderId;
    fields: Record<string, string>;
  },
) {
  const matcher: Record<string, unknown> = {
    module: expected.module,
    fields: expected.fields,
  };
  if (expected.providerId) {
    matcher.providerId = expected.providerId;
  }

  expect(operation).not.toBeNull();
  expect(operation).toEqual(expect.objectContaining(matcher));
}

describe('useSettingsState', () => {
  it('tracks dirty fields and clears dirty after revert', () => {
    const { result } = renderHook(() => useSettingsState(createInitialDraft()));

    act(() => {
      result.current.updateProviderField('openai', 'baseUrl', 'https://api.alt.example/v1');
    });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.dirtyFields).toContain('provider:openai:baseUrl');

    act(() => {
      result.current.updateProviderField('openai', 'baseUrl', 'https://api.openai.com/v1');
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.dirtyFields).toHaveLength(0);
  });

  it('tracks ui dirty fields and clears after revert', () => {
    const { result } = renderHook(() => useSettingsState(createInitialDraft()));

    act(() => {
      result.current.updateUiField('theme', 'dark');
    });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.dirtyFields).toContain('ui:theme');

    act(() => {
      result.current.updateUiField('theme', 'system');
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.dirtyFields).toHaveLength(0);
  });

  it('dedupes line-save and module-save by clearing saved field dirtiness', () => {
    const { result } = renderHook(() => useSettingsState(createInitialDraft()));

    act(() => {
      result.current.updateProviderField('openai', 'baseUrl', 'https://internal.example/v1');
      result.current.updateProviderField('openai', 'apiKey', 'sk-abcdefghijklmnopqrstuvwxyz');
    });

    const lineOperation = result.current.getLineSaveOperation({
      module: 'provider',
      providerId: 'openai',
      field: 'baseUrl',
    });
    expectOperation(lineOperation, {
      module: 'provider',
      providerId: 'openai',
      fields: { baseUrl: 'https://internal.example/v1' },
    });

    act(() => {
      if (lineOperation) {
        result.current.applySaveSuccess(lineOperation);
      }
    });

    const moduleOperation = result.current.getModuleSaveOperation({
      module: 'provider',
      providerId: 'openai',
    });
    expectOperation(moduleOperation, {
      module: 'provider',
      providerId: 'openai',
      fields: { apiKey: 'sk-abcdefghijklmnopqrstuvwxyz' },
    });
  });

  it('returns save-all operations with module ordering and dedupe', () => {
    const { result } = renderHook(() => useSettingsState(createInitialDraft()));

    act(() => {
      result.current.updateProviderField('openai', 'llmModel', 'gpt-4.1-mini');
      result.current.updateStorageField('storagePath', '/tmp/kb-next');
      result.current.updateUiField('language', 'en-US');
    });

    const providerModuleSave = result.current.getModuleSaveOperation({
      module: 'provider',
      providerId: 'openai',
    });
    act(() => {
      if (providerModuleSave) {
        result.current.applySaveSuccess(providerModuleSave);
      }
    });

    const saveAllOperations = result.current.getSaveAllOperations();
    expect(saveAllOperations).toHaveLength(2);
    expect(saveAllOperations[0]).toEqual(
      expect.objectContaining({
        module: 'ui',
        fields: { language: 'en-US' },
      }),
    );
    expect(saveAllOperations[1]).toEqual(
      expect.objectContaining({
        module: 'storage',
        fields: { storagePath: '/tmp/kb-next' },
      }),
    );
  });

  it('supports ui module-save and save-all dedupe', () => {
    const { result } = renderHook(() => useSettingsState(createInitialDraft()));

    act(() => {
      result.current.updateUiField('theme', 'light');
      result.current.updateStorageField('storagePath', '/tmp/kb-next');
    });

    const uiModuleSave = result.current.getModuleSaveOperation({ module: 'ui' });
    expectOperation(uiModuleSave, {
      module: 'ui',
      fields: { theme: 'light' },
    });

    act(() => {
      if (uiModuleSave) {
        result.current.applySaveSuccess(uiModuleSave);
      }
    });

    const saveAllOperations = result.current.getSaveAllOperations();
    expect(saveAllOperations).toHaveLength(1);
    expect(saveAllOperations[0]).toEqual(
      expect.objectContaining({
        module: 'storage',
        fields: { storagePath: '/tmp/kb-next' },
      }),
    );
    expect(result.current.dirtyFields).not.toContain('ui:theme');
  });

  it('keeps dirty when draft changed after operation snapshot', () => {
    const { result } = renderHook(() => useSettingsState(createInitialDraft()));

    act(() => {
      result.current.updateProviderField('openai', 'baseUrl', 'https://first.example/v1');
    });

    const snapshotOperation = result.current.getLineSaveOperation({
      module: 'provider',
      providerId: 'openai',
      field: 'baseUrl',
    });

    act(() => {
      result.current.updateProviderField('openai', 'baseUrl', 'https://second.example/v1');
    });

    act(() => {
      if (snapshotOperation) {
        result.current.applySaveSuccess(snapshotOperation);
      }
    });

    expect(result.current.dirtyFields).toContain('provider:openai:baseUrl');

    const pendingOperation = result.current.getLineSaveOperation({
      module: 'provider',
      providerId: 'openai',
      field: 'baseUrl',
    });
    expectOperation(pendingOperation, {
      module: 'provider',
      providerId: 'openai',
      fields: { baseUrl: 'https://second.example/v1' },
    });
  });

  it('keeps ui dirty when stale save succeeds before latest value persists', () => {
    const { result } = renderHook(() => useSettingsState(createInitialDraft()));

    act(() => {
      result.current.updateUiField('language', 'en-US');
    });
    const firstOperation = result.current.getModuleSaveOperation({ module: 'ui' });

    act(() => {
      result.current.updateUiField('language', 'zh-CN');
    });

    act(() => {
      if (firstOperation) {
        result.current.applySaveSuccess(firstOperation);
      }
    });

    expect(result.current.dirtyFields).toContain('ui:language');
    expect(result.current.isDirty).toBe(true);

    const pendingOperation = result.current.getModuleSaveOperation({ module: 'ui' });
    expectOperation(pendingOperation, {
      module: 'ui',
      fields: { language: 'zh-CN' },
    });
  });

  it('exposes aggregated validation state for ui consumption', () => {
    const { result } = renderHook(() => useSettingsState(createInitialDraft()));

    act(() => {
      result.current.updateProviderField('openai', 'baseUrl', 'http://api.openai.com/v1');
      result.current.updateProviderField('openai', 'apiKey', 'bad-key');
    });

    const validation = result.current.validate();
    expect(validation.valid).toBe(false);
    expect(validation.byModule.provider.errors).toHaveLength(2);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: 'provider', code: 'CONFIG_URL_INVALID', field: 'baseUrl' }),
        expect.objectContaining({ module: 'provider', code: 'API_KEY_INVALID_FORMAT', field: 'apiKey' }),
      ]),
    );
  });
});

type _AssertUseSettingsStateApi = UseSettingsStateApi;
