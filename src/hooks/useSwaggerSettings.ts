import * as React from "react";
import { SwaggerSettingsService } from "../services/SwaggerSettingsService";
import { GlobalSettingsDocument, SwaggerApiEntry, LintRuleOverride } from "../models/interfaces";
import { formatError } from "../utils/formatError";

export interface UseSwaggerSettingsResult {
  loading: boolean;
  error: string | null;
  globalSettings: GlobalSettingsDocument | null;
  apis: SwaggerApiEntry[];
  lintOverrides: LintRuleOverride[];
  saveGlobalSettings: (
    updates: Partial<
      Pick<
        GlobalSettingsDocument,
        | "apiKey"
        | "authHeaderName"
        | "autoScanOnLoad"
        | "refreshIntervalMinutes"
        | "apiKeySource"
        | "variableGroupRef"
      >
    >
  ) => Promise<void>;
  addApi: (api: SwaggerApiEntry) => Promise<void>;
  removeApi: (apiId: string) => Promise<void>;
  updateApi: (
    apiId: string,
    updates: Partial<
      Pick<
        SwaggerApiEntry,
        | "name"
        | "url"
        | "visibility"
        | "publishStatus"
        | "lastScannedAt"
        | "lastFindingCount"
        | "lastEndpointCount"
        | "apiKey"
        | "authHeaderName"
      >
    >
  ) => Promise<void>;
  saveLintOverrides: (overrides: LintRuleOverride[]) => Promise<void>;
  reload: () => Promise<void>;
}

export function useSwaggerSettings(): UseSwaggerSettingsResult {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [globalSettings, setGlobalSettings] = React.useState<GlobalSettingsDocument | null>(null);
  const [apis, setApis] = React.useState<SwaggerApiEntry[]>([]);
  const [lintOverrides, setLintOverrides] = React.useState<LintRuleOverride[]>([]);
  const serviceRef = React.useRef(new SwaggerSettingsService());

  const loadAll = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [settingsDoc, apisDoc, overridesDoc] = await Promise.all([
        serviceRef.current.getGlobalSettings(),
        serviceRef.current.getSwaggerApis(),
        serviceRef.current.getLintOverrides(),
      ]);
      setGlobalSettings(settingsDoc);
      setApis(apisDoc.apis);
      setLintOverrides(overridesDoc.overrides);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  const saveGlobalSettings = React.useCallback(
    async (
      updates: Partial<
        Pick<
          GlobalSettingsDocument,
          | "apiKey"
          | "authHeaderName"
          | "autoScanOnLoad"
          | "refreshIntervalMinutes"
          | "apiKeySource"
          | "variableGroupRef"
        >
      >
    ) => {
      const doc = await serviceRef.current.saveGlobalSettings(updates);
      setGlobalSettings(doc);
    },
    []
  );

  const addApi = React.useCallback(async (api: SwaggerApiEntry) => {
    const doc = await serviceRef.current.addSwaggerApi(api);
    setApis(doc.apis);
  }, []);

  const removeApi = React.useCallback(async (apiId: string) => {
    const doc = await serviceRef.current.removeSwaggerApi(apiId);
    setApis(doc.apis);
  }, []);

  const updateApi = React.useCallback(
    async (
      apiId: string,
      updates: Partial<
        Pick<
          SwaggerApiEntry,
          | "name"
          | "url"
          | "visibility"
          | "publishStatus"
          | "lastScannedAt"
          | "lastFindingCount"
          | "lastEndpointCount"
        >
      >
    ) => {
      const doc = await serviceRef.current.updateSwaggerApi(apiId, updates);
      setApis(doc.apis);
    },
    []
  );

  const saveLintOverrides = React.useCallback(async (overrides: LintRuleOverride[]) => {
    const doc = await serviceRef.current.saveLintOverrides(overrides);
    setLintOverrides(doc.overrides);
  }, []);

  return {
    loading,
    error,
    globalSettings,
    apis,
    lintOverrides,
    saveGlobalSettings,
    addApi,
    removeApi,
    updateApi,
    saveLintOverrides,
    reload: loadAll,
  };
}
