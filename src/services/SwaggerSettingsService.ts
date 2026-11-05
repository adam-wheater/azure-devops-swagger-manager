import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  IExtensionDataService,
  IExtensionDataManager,
} from "azure-devops-extension-api";
import {
  GlobalSettingsDocument,
  SwaggerApisDocument,
  SwaggerApiEntry,
  LintRuleOverridesDocument,
  LintRuleOverride,
  ApiScanSummary,
  BugMappingEntry,
  BugMappingDocument,
  LintFinding,
  PersistedScanFindings,
  PersistedScanFindingsDocument,
  ApiKeySource,
} from "../models/interfaces";
import {
  SETTINGS_COLLECTION,
  GLOBAL_SETTINGS_DOC_ID,
  SWAGGER_APIS_DOC_ID,
  LINT_OVERRIDES_DOC_ID,
  SCAN_SUMMARIES_DOC_ID,
  BUG_MAPPING_DOC_ID,
  SCAN_FINDINGS_DOC_ID,
  SETTINGS_VERSION,
} from "../utils/constants";
import { KeyedMutex } from "../utils/mutex";
import { isNotFound } from "../utils/extensionData";

export class SwaggerSettingsService {
  private dataManagerPromise: Promise<IExtensionDataManager> | null = null;
  private mutex = new KeyedMutex();

  private async getDataManager(): Promise<IExtensionDataManager> {
    if (!this.dataManagerPromise) {
      this.dataManagerPromise = (async () => {
        const service = await SDK.getService<IExtensionDataService>(
          CommonServiceIds.ExtensionDataService
        );
        const accessToken = await SDK.getAccessToken();
        return service.getExtensionDataManager(SDK.getExtensionContext().id, accessToken);
      })();
    }
    return this.dataManagerPromise;
  }

  /**
   * Read a document, or build `fresh()` when the server says it has never been
   * written (404); with `seed`, that fresh document is also stored. Any other
   * failure rethrows, so a network blip can never read as "empty" and then be
   * written back over the stored APIs, settings or findings.
   */
  private async readDoc<T>(id: string, fresh: () => T, seed = false): Promise<T> {
    const manager = await this.getDataManager();
    try {
      return (await manager.getDocument(SETTINGS_COLLECTION, id)) as T;
    } catch (err) {
      if (!isNotFound(err)) throw err;
      const doc = fresh();
      if (seed) await manager.setDocument(SETTINGS_COLLECTION, doc);
      return doc;
    }
  }

  // ===== Global Settings =====

  async getGlobalSettings(): Promise<GlobalSettingsDocument> {
    const release = await this.mutex.acquire(GLOBAL_SETTINGS_DOC_ID);
    try {
      return await this.readDoc<GlobalSettingsDocument>(
        GLOBAL_SETTINGS_DOC_ID,
        () => ({
          id: GLOBAL_SETTINGS_DOC_ID,
          apiKey: "",
          authHeaderName: "X-API-Key",
          autoScanOnLoad: true,
          refreshIntervalMinutes: 5,
          apiKeySource: ApiKeySource.Direct,
          version: SETTINGS_VERSION,
        }),
        true
      );
    } finally {
      release();
    }
  }

  async saveGlobalSettings(
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
  ): Promise<GlobalSettingsDocument> {
    const release = await this.mutex.acquire(GLOBAL_SETTINGS_DOC_ID);
    try {
      const doc = await this._getGlobalSettingsUnsafe();
      if (updates.apiKey !== undefined) doc.apiKey = updates.apiKey;
      if (updates.authHeaderName !== undefined) doc.authHeaderName = updates.authHeaderName;
      if (updates.autoScanOnLoad !== undefined) doc.autoScanOnLoad = updates.autoScanOnLoad;
      if (updates.refreshIntervalMinutes !== undefined)
        doc.refreshIntervalMinutes = updates.refreshIntervalMinutes;
      if (updates.apiKeySource !== undefined) doc.apiKeySource = updates.apiKeySource;
      if (updates.variableGroupRef !== undefined) doc.variableGroupRef = updates.variableGroupRef;
      const manager = await this.getDataManager();
      await manager.setDocument(SETTINGS_COLLECTION, doc);
      return doc;
    } finally {
      release();
    }
  }

  /** Internal read without mutex — caller must hold the lock. */
  private async _getGlobalSettingsUnsafe(): Promise<GlobalSettingsDocument> {
    return this.readDoc<GlobalSettingsDocument>(
      GLOBAL_SETTINGS_DOC_ID,
      () => ({
        id: GLOBAL_SETTINGS_DOC_ID,
        apiKey: "",
        authHeaderName: "X-API-Key",
        autoScanOnLoad: false,
        apiKeySource: ApiKeySource.Direct,
        refreshIntervalMinutes: 5,
        version: SETTINGS_VERSION,
      }),
      true
    );
  }

  // ===== Swagger APIs =====

  async getSwaggerApis(): Promise<SwaggerApisDocument> {
    const release = await this.mutex.acquire(SWAGGER_APIS_DOC_ID);
    try {
      return await this.readDoc<SwaggerApisDocument>(
        SWAGGER_APIS_DOC_ID,
        () => ({
          id: SWAGGER_APIS_DOC_ID,
          apis: [],
          version: SETTINGS_VERSION,
        }),
        true
      );
    } finally {
      release();
    }
  }

  async addSwaggerApi(api: SwaggerApiEntry): Promise<SwaggerApisDocument> {
    const release = await this.mutex.acquire(SWAGGER_APIS_DOC_ID);
    try {
      const doc = await this._getSwaggerApisUnsafe();
      if (doc.apis.some((a) => a.url === api.url)) {
        throw new Error(`API with URL "${api.url}" already exists.`);
      }
      doc.apis.push(api);
      const manager = await this.getDataManager();
      await manager.setDocument(SETTINGS_COLLECTION, doc);
      return doc;
    } finally {
      release();
    }
  }

  async removeSwaggerApi(apiId: string): Promise<SwaggerApisDocument> {
    const release = await this.mutex.acquire(SWAGGER_APIS_DOC_ID);
    try {
      const doc = await this._getSwaggerApisUnsafe();
      const idx = doc.apis.findIndex((a) => a.id === apiId);
      if (idx === -1) throw new Error(`API "${apiId}" not found.`);
      doc.apis.splice(idx, 1);
      const manager = await this.getDataManager();
      await manager.setDocument(SETTINGS_COLLECTION, doc);
      return doc;
    } finally {
      release();
    }
  }

  async updateSwaggerApi(
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
  ): Promise<SwaggerApisDocument> {
    const release = await this.mutex.acquire(SWAGGER_APIS_DOC_ID);
    try {
      const doc = await this._getSwaggerApisUnsafe();
      const idx = doc.apis.findIndex((a) => a.id === apiId);
      if (idx === -1) throw new Error(`API "${apiId}" not found.`);
      doc.apis[idx] = { ...doc.apis[idx], ...updates };
      const manager = await this.getDataManager();
      await manager.setDocument(SETTINGS_COLLECTION, doc);
      return doc;
    } finally {
      release();
    }
  }

  /** Internal read without mutex — caller must hold the lock. */
  private async _getSwaggerApisUnsafe(): Promise<SwaggerApisDocument> {
    return this.readDoc<SwaggerApisDocument>(
      SWAGGER_APIS_DOC_ID,
      () => ({
        id: SWAGGER_APIS_DOC_ID,
        apis: [],
        version: SETTINGS_VERSION,
      }),
      true
    );
  }

  // ===== Lint Rule Overrides =====

  async getLintOverrides(): Promise<LintRuleOverridesDocument> {
    const release = await this.mutex.acquire(LINT_OVERRIDES_DOC_ID);
    try {
      return await this.readDoc<LintRuleOverridesDocument>(
        LINT_OVERRIDES_DOC_ID,
        () => ({
          id: LINT_OVERRIDES_DOC_ID,
          overrides: [],
          version: SETTINGS_VERSION,
        }),
        true
      );
    } finally {
      release();
    }
  }

  async saveLintOverrides(overrides: LintRuleOverride[]): Promise<LintRuleOverridesDocument> {
    const release = await this.mutex.acquire(LINT_OVERRIDES_DOC_ID);
    try {
      const manager = await this.getDataManager();
      const doc = await this.readDoc<LintRuleOverridesDocument>(LINT_OVERRIDES_DOC_ID, () => ({
        id: LINT_OVERRIDES_DOC_ID,
        overrides: [],
        version: SETTINGS_VERSION,
      }));
      doc.overrides = overrides;
      await manager.setDocument(SETTINGS_COLLECTION, doc);
      return doc;
    } finally {
      release();
    }
  }

  // ===== Scan Summaries =====

  async saveScanSummary(summary: Record<string, ApiScanSummary>): Promise<void> {
    const release = await this.mutex.acquire(SCAN_SUMMARIES_DOC_ID);
    try {
      const manager = await this.getDataManager();
      await manager.setDocument(SETTINGS_COLLECTION, {
        id: SCAN_SUMMARIES_DOC_ID,
        summaries: summary,
        version: SETTINGS_VERSION,
      });
    } finally {
      release();
    }
  }

  async loadScanSummary(): Promise<Record<string, ApiScanSummary> | null> {
    const manager = await this.getDataManager();
    try {
      const doc = await manager.getDocument(SETTINGS_COLLECTION, SCAN_SUMMARIES_DOC_ID);
      return (doc as { summaries: Record<string, ApiScanSummary> }).summaries ?? null;
    } catch {
      return null;
    }
  }

  // ===== Bug Mapping Persistence =====

  async loadBugMappings(): Promise<BugMappingEntry[]> {
    const manager = await this.getDataManager();
    try {
      const doc = (await manager.getDocument(
        SETTINGS_COLLECTION,
        BUG_MAPPING_DOC_ID
      )) as BugMappingDocument;
      return doc.mappings ?? [];
    } catch {
      return [];
    }
  }

  async saveBugMapping(entry: BugMappingEntry): Promise<void> {
    const release = await this.mutex.acquire(BUG_MAPPING_DOC_ID);
    try {
      const manager = await this.getDataManager();
      const doc = await this.readDoc<BugMappingDocument>(BUG_MAPPING_DOC_ID, () => ({
        id: BUG_MAPPING_DOC_ID,
        mappings: [],
        version: SETTINGS_VERSION,
      }));
      // Upsert — replace if same findingKey already exists
      const idx = doc.mappings.findIndex((m) => m.findingKey === entry.findingKey);
      if (idx >= 0) {
        doc.mappings[idx] = entry;
      } else {
        doc.mappings.push(entry);
      }
      await manager.setDocument(SETTINGS_COLLECTION, doc);
    } finally {
      release();
    }
  }

  // ===== Scan Findings Persistence =====

  async saveScanFindings(apiId: string, findings: LintFinding[], scannedAt: string): Promise<void> {
    const release = await this.mutex.acquire(SCAN_FINDINGS_DOC_ID);
    try {
      const manager = await this.getDataManager();
      const doc = await this.readDoc<PersistedScanFindingsDocument>(SCAN_FINDINGS_DOC_ID, () => ({
        id: SCAN_FINDINGS_DOC_ID,
        findings: {},
        version: SETTINGS_VERSION,
      }));
      doc.findings[apiId] = { apiId, findings, scannedAt };
      await manager.setDocument(SETTINGS_COLLECTION, doc);
    } finally {
      release();
    }
  }

  async loadScanFindings(): Promise<Record<string, PersistedScanFindings> | null> {
    const manager = await this.getDataManager();
    try {
      const doc = (await manager.getDocument(
        SETTINGS_COLLECTION,
        SCAN_FINDINGS_DOC_ID
      )) as PersistedScanFindingsDocument;
      return doc.findings ?? null;
    } catch {
      return null;
    }
  }
}
