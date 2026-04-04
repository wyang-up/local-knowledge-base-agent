import { useMemo, useRef, useState } from 'react';
import type {
  ProviderDraft,
  ProviderField,
  ProviderPatchFields,
  SettingsDraft,
  SettingsValidationResult,
  StorageField,
  StoragePatchFields,
  UiField,
  UiPatchFields,
} from './types.ts';
import { validateSettingsDraft } from './validators.ts';

type ModuleId = 'provider' | 'storage' | 'ui';

export type SaveOperation =
  | {
      module: 'provider';
      providerId: ProviderDraft['providerId'];
      fields: ProviderPatchFields;
    }
  | {
      module: 'storage';
      fields: StoragePatchFields;
    }
  | {
      module: 'ui';
      fields: UiPatchFields;
    };

export interface UseSettingsStateApi {
  draft: SettingsDraft;
  dirtyFields: string[];
  isDirty: boolean;
  validation: SettingsValidationResult;
  updateProviderField: (providerId: ProviderDraft['providerId'], field: ProviderField, value: string) => void;
  updateStorageField: (field: StorageField, value: string) => void;
  updateUiField: (field: UiField, value: string) => void;
  validate: () => SettingsValidationResult;
  getLineSaveOperation: (params: {
    module: 'provider';
    providerId: ProviderDraft['providerId'];
    field: ProviderField;
  }) => SaveOperation | null;
  getModuleSaveOperation: (
    params:
      | { module: 'provider'; providerId: ProviderDraft['providerId'] }
      | { module: 'storage' }
      | { module: 'ui' },
  ) => SaveOperation | null;
  getSaveAllOperations: () => SaveOperation[];
  applySaveSuccess: (operation: SaveOperation) => void;
  resetModule: (params: { module: 'ui' } | { module: 'storage' } | { module: 'provider'; providerId: ProviderDraft['providerId'] }) => void;
  replaceAll: (next: SettingsDraft, options?: { syncBaseline?: boolean }) => void;
}

export function useSettingsState(initial: SettingsDraft): UseSettingsStateApi {
  const [draft, setDraft] = useState<SettingsDraft>(initial);
  const [baseline, setBaseline] = useState<SettingsDraft>(initial);
  const [dirtyFieldSet, setDirtyFieldSet] = useState<Set<string>>(() => new Set());
  const [validation, setValidation] = useState<SettingsValidationResult>(() => validateSettingsDraft(initial));
  const latestDraftRef = useRef<SettingsDraft>(initial);

  const updateDraft = (updater: (prev: SettingsDraft) => SettingsDraft) => {
    setDraft((prev) => {
      const next = updater(prev);
      latestDraftRef.current = next;
      return next;
    });
  };

  const dirtyFields = useMemo(() => Array.from(dirtyFieldSet.values()), [dirtyFieldSet]);

  const updateProviderField: UseSettingsStateApi['updateProviderField'] = (providerId, field, value) => {
    const baselineProvider = findProvider(baseline, providerId);
    updateDraft((prev) => {
      const nextProviders = prev.providers.map((provider) => {
        if (provider.providerId !== providerId) {
          return provider;
        }
        return {
          ...provider,
          [field]: value,
        };
      });
      return {
        ...prev,
        providers: nextProviders,
      };
    });

    setDirtyFieldSet((prev) => {
      const next = new Set(prev);
      const key = buildProviderFieldKey(providerId, field);
      const baselineValue = baselineProvider?.[field] ?? '';
      if (value === baselineValue) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const updateStorageField: UseSettingsStateApi['updateStorageField'] = (field, value) => {
    updateDraft((prev) => ({
      ...prev,
      storage: {
        ...prev.storage,
        [field]: value,
      },
    }));

    setDirtyFieldSet((prev) => {
      const next = new Set(prev);
      const key = buildStorageFieldKey(field);
      const baselineValue = baseline.storage[field] ?? '';
      if (value === baselineValue) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const updateUiField: UseSettingsStateApi['updateUiField'] = (field, value) => {
    updateDraft((prev) => ({
      ...prev,
      ui: {
        ...prev.ui,
        [field]: value,
      },
    }));

    setDirtyFieldSet((prev) => {
      const next = new Set(prev);
      const key = buildUiFieldKey(field);
      const baselineValue = baseline.ui[field] ?? '';
      if (value === baselineValue) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const validate: UseSettingsStateApi['validate'] = () => {
    const result = validateSettingsDraft(draft);
    setValidation(result);
    return result;
  };

  const getLineSaveOperation: UseSettingsStateApi['getLineSaveOperation'] = ({ module, providerId, field }) => {
    if (module !== 'provider') {
      return null;
    }

    const dirtyKey = buildProviderFieldKey(providerId, field);
    if (!dirtyFieldSet.has(dirtyKey)) {
      return null;
    }

    const provider = findProvider(draft, providerId);
    if (!provider) {
      return null;
    }

    return {
      module: 'provider',
      providerId,
      fields: {
        [field]: provider[field],
      },
    };
  };

  const getModuleSaveOperation: UseSettingsStateApi['getModuleSaveOperation'] = (params) => {
    if (params.module === 'ui') {
      const uiFields: UiPatchFields = {};
      for (const field of ['language', 'theme'] as const) {
        const key = buildUiFieldKey(field);
        if (dirtyFieldSet.has(key)) {
          uiFields[field] = draft.ui[field];
        }
      }

      if (Object.keys(uiFields).length === 0) {
        return null;
      }

      return {
        module: 'ui',
        fields: uiFields,
      };
    }

    if (params.module === 'storage') {
      const storageFields: StoragePatchFields = {};
      for (const field of ['storagePath', 'documentStoragePath'] as const) {
        const key = buildStorageFieldKey(field);
        if (dirtyFieldSet.has(key)) {
          storageFields[field] = draft.storage[field];
        }
      }

      if (Object.keys(storageFields).length === 0) {
        return null;
      }

      return {
        module: 'storage',
        fields: storageFields,
      };
    }

    const provider = findProvider(draft, params.providerId);
    if (!provider) {
      return null;
    }

    const fields: ProviderPatchFields = {};
    for (const field of ['baseUrl', 'apiKey', 'llmModel', 'embeddingModel'] as const) {
      const key = buildProviderFieldKey(params.providerId, field);
      if (dirtyFieldSet.has(key)) {
        fields[field] = provider[field];
      }
    }

    if (Object.keys(fields).length === 0) {
      return null;
    }

    return {
      module: 'provider',
      providerId: params.providerId,
      fields,
    };
  };

  const getSaveAllOperations: UseSettingsStateApi['getSaveAllOperations'] = () => {
    const operations: SaveOperation[] = [];

    const uiOperation = getModuleSaveOperation({ module: 'ui' });
    if (uiOperation) {
      operations.push(uiOperation);
    }

    for (const provider of draft.providers) {
      const operation = getModuleSaveOperation({ module: 'provider', providerId: provider.providerId });
      if (operation) {
        operations.push(operation);
      }
    }

    const storageOperation = getModuleSaveOperation({ module: 'storage' });
    if (storageOperation) {
      operations.push(storageOperation);
    }

    return operations;
  };

  const applySaveSuccess: UseSettingsStateApi['applySaveSuccess'] = (operation) => {
    setBaseline((prev) => {
      if (operation.module === 'provider') {
        const nextProviders = prev.providers.map((provider) => {
          if (provider.providerId !== operation.providerId) {
            return provider;
          }
          return {
            ...provider,
            ...operation.fields,
          };
        });
        return {
          ...prev,
          providers: nextProviders,
        };
      }

      if (operation.module === 'storage') {
        return {
          ...prev,
          storage: {
            ...prev.storage,
            ...operation.fields,
          },
        };
      }

      return {
        ...prev,
        ui: {
          ...prev.ui,
          ...operation.fields,
        },
      };
    });

    setDirtyFieldSet((prev) => {
      const next = new Set(prev);
      const latestDraft = latestDraftRef.current;
      if (operation.module === 'provider') {
        for (const field of ['baseUrl', 'apiKey', 'llmModel', 'embeddingModel'] as const) {
          const savedValue = operation.fields[field];
          if (savedValue === undefined) {
            continue;
          }
          const key = buildProviderFieldKey(operation.providerId, field);
          if (isProviderFieldSynced(latestDraft, operation.providerId, field, savedValue)) {
            next.delete(key);
          } else {
            next.add(key);
          }
        }
      } else if (operation.module === 'storage') {
        for (const field of ['storagePath', 'documentStoragePath'] as const) {
          const savedValue = operation.fields[field];
          if (savedValue === undefined) {
            continue;
          }
          const key = buildStorageFieldKey(field);
          if (isStorageFieldSynced(latestDraft, field, savedValue)) {
            next.delete(key);
          } else {
            next.add(key);
          }
        }
      } else {
        for (const field of ['language', 'theme'] as const) {
          const savedValue = operation.fields[field];
          if (savedValue === undefined) {
            continue;
          }
          const key = buildUiFieldKey(field);
          if (isUiFieldSynced(latestDraft, field, savedValue)) {
            next.delete(key);
          } else {
            next.add(key);
          }
        }
      }
      return next;
    });
  };

  const resetModule: UseSettingsStateApi['resetModule'] = (params) => {
    if (params.module === 'ui') {
      updateDraft((prev) => ({ ...prev, ui: { ...baseline.ui } }));
      setDirtyFieldSet((prev) => {
        const next = new Set(prev);
        for (const field of ['language', 'theme'] as const) {
          next.delete(buildUiFieldKey(field));
        }
        return next;
      });
      return;
    }

    if (params.module === 'storage') {
      updateDraft((prev) => ({ ...prev, storage: { ...baseline.storage } }));
      setDirtyFieldSet((prev) => {
        const next = new Set(prev);
        next.delete(buildStorageFieldKey('storagePath'));
        next.delete(buildStorageFieldKey('documentStoragePath'));
        return next;
      });
      return;
    }

    const baselineProvider = findProvider(baseline, params.providerId);
    if (!baselineProvider) {
      return;
    }

    updateDraft((prev) => ({
      ...prev,
      providers: prev.providers.map((provider) => (
        provider.providerId === params.providerId
          ? { ...baselineProvider }
          : provider
      )),
    }));

    setDirtyFieldSet((prev) => {
      const next = new Set(prev);
      for (const field of ['baseUrl', 'apiKey', 'llmModel', 'embeddingModel'] as const) {
        next.delete(buildProviderFieldKey(params.providerId, field));
      }
      return next;
    });
  };

  const replaceAll: UseSettingsStateApi['replaceAll'] = (next, options) => {
    const normalized: SettingsDraft = JSON.parse(JSON.stringify(next));
    latestDraftRef.current = normalized;
    setDraft(normalized);
    if (options?.syncBaseline) {
      setBaseline(normalized);
      setDirtyFieldSet(new Set());
    } else {
      setDirtyFieldSet(new Set());
    }
    setValidation(validateSettingsDraft(normalized));
  };

  return {
    draft,
    dirtyFields,
    isDirty: dirtyFields.length > 0,
    validation,
    updateProviderField,
    updateStorageField,
    updateUiField,
    validate,
    getLineSaveOperation,
    getModuleSaveOperation,
    getSaveAllOperations,
    applySaveSuccess,
    resetModule,
    replaceAll,
  };
}

function findProvider(draft: SettingsDraft, providerId: ProviderDraft['providerId']) {
  return draft.providers.find((provider) => provider.providerId === providerId);
}

function buildProviderFieldKey(providerId: ProviderDraft['providerId'], field: ProviderField) {
  return `provider:${providerId}:${field}`;
}

function buildStorageFieldKey(field: StorageField) {
  return `storage:${field}`;
}

function buildUiFieldKey(field: UiField) {
  return `ui:${field}`;
}

function isProviderFieldSynced(
  draft: SettingsDraft,
  providerId: ProviderDraft['providerId'],
  field: ProviderField,
  savedValue: string,
) {
  const provider = findProvider(draft, providerId);
  if (!provider) {
    return false;
  }
  return provider[field] === savedValue;
}

function isStorageFieldSynced(draft: SettingsDraft, field: StorageField, savedValue: string) {
  return draft.storage[field] === savedValue;
}

function isUiFieldSynced(draft: SettingsDraft, field: UiField, savedValue: string) {
  return draft.ui[field] === savedValue;
}
