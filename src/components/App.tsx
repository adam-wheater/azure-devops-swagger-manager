import * as React from "react";
import { BRAND, BrandGlyph } from "../brand";
import { useAdmin } from "../hooks/useAdmin";
import { useSwaggerSettings } from "../hooks/useSwaggerSettings";
import { formatError } from "../utils/formatError";
import { SwaggerLinter } from "../scanning/SwaggerLinter";
import { SwaggerFetchService } from "../services/SwaggerFetchService";
import { SwaggerSettingsService } from "../services/SwaggerSettingsService";
import { VariableGroupService } from "../services/VariableGroupService";
import { SwaggerDiscoveryService, DiscoveredApi } from "../services/SwaggerDiscoveryService";
import {
  ApiScanResult,
  ApiScanSummary,
  ScanProgress,
  Severity,
  BugMappingEntry,
  ApiKeySource,
  ApiVisibility,
  ApiPublishStatus,
} from "../models/interfaces";
import { generateId } from "../utils/idUtils";
import { CreatedWorkItem } from "../services/WorkItemService";
import { AdminClaimPage } from "./AdminClaimPage";
import { AdminPanel } from "./AdminPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ApiDashboard } from "./ApiDashboard";
import { ApiAnalysis } from "./ApiAnalysis";
import { LintRulesPanel } from "./LintRulesPanel";
import { ApiDetailPage } from "./ApiDetailPage";
import { AppShell, Banner, ErrorBoundary, Gate, Pill, Tabs } from "./ui";

type ViewMode = "dashboard" | "detail" | "analysis" | "rules" | "settings" | "admin";

const SCAN_CONCURRENCY = 3;

const AppInner: React.FC = () => {
  const admin = useAdmin();
  const settings = useSwaggerSettings();

  const [activeView, setActiveView] = React.useState<ViewMode>("dashboard");
  const [scanResults, setScanResults] = React.useState<Map<string, ApiScanResult>>(new Map());
  const [scanning, setScanning] = React.useState(false);
  const [scanProgress, setScanProgress] = React.useState<ScanProgress | null>(null);
  const [scanErrors, setScanErrors] = React.useState<Map<string, string>>(new Map());
  const [selectedApiId, setSelectedApiId] = React.useState<string | null>(null);
  const [showReadOnlyNotice, setShowReadOnlyNotice] = React.useState(true);

  const [persistedSummaries, setPersistedSummaries] = React.useState<
    Record<string, ApiScanSummary>
  >({});

  // Bug mapping persisted across navigation
  const [bugMappings, setBugMappings] = React.useState<Map<string, CreatedWorkItem>>(new Map());

  const scanLockRef = React.useRef(false);
  const autoScanFiredRef = React.useRef(false);
  const linterRef = React.useRef(new SwaggerLinter());
  const fetchServiceRef = React.useRef(new SwaggerFetchService());
  const settingsServiceRef = React.useRef(new SwaggerSettingsService());
  const varGroupServiceRef = React.useRef(new VariableGroupService());
  const discoveryServiceRef = React.useRef(new SwaggerDiscoveryService());
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Discovery state
  const [discovering, setDiscovering] = React.useState(false);
  const [discoveredApis, setDiscoveredApis] = React.useState<DiscoveredApi[]>([]);
  const [discoveryError, setDiscoveryError] = React.useState<string | null>(null);

  // Load persisted bug mappings on mount
  React.useEffect(() => {
    if (!settings.loading) {
      settingsServiceRef.current
        .loadBugMappings()
        .then((entries) => {
          const map = new Map<string, CreatedWorkItem>();
          for (const e of entries) {
            map.set(e.findingKey, { id: e.bugId, url: e.bugUrl });
          }
          setBugMappings(map);
        })
        .catch(() => {
          // Non-critical
        });
    }
  }, [settings.loading]);

  const handleBugCreated = React.useCallback((findingKey: string, workItem: CreatedWorkItem) => {
    setBugMappings((prev) => {
      const next = new Map(prev);
      next.set(findingKey, workItem);
      return next;
    });
    // Persist
    const entry: BugMappingEntry = {
      findingKey,
      bugId: workItem.id,
      bugUrl: workItem.url,
    };
    settingsServiceRef.current.saveBugMapping(entry).catch(() => {
      // Non-critical
    });
  }, []);

  const scanApi = React.useCallback(
    async (apiId: string, signal?: AbortSignal) => {
      const api = settings.apis.find((a) => a.id === apiId);
      if (!api || !settings.globalSettings) return;

      // Resolve global API key — from variable group if configured
      let resolvedApiKey = settings.globalSettings.apiKey;
      const gs = settings.globalSettings;
      if (gs.apiKeySource === ApiKeySource.VariableGroup && gs.variableGroupRef) {
        const value = await varGroupServiceRef.current.getVariableValue(
          gs.variableGroupRef.groupId,
          gs.variableGroupRef.variableName
        );
        if (!value) {
          throw new Error(
            `Could not read variable "${gs.variableGroupRef.variableName}" from group "${gs.variableGroupRef.groupName}". The variable may be secret or missing.`
          );
        }
        resolvedApiKey = value;
      }

      const spec = await fetchServiceRef.current.fetchSpec(
        api.url,
        resolvedApiKey,
        settings.globalSettings.authHeaderName,
        api,
        signal
      );
      const findings = linterRef.current.lint(spec, settings.lintOverrides, api);
      const endpointCount = fetchServiceRef.current.countEndpoints(spec);

      const result: ApiScanResult = {
        api,
        spec,
        findings,
        endpointCount,
        scannedAt: new Date(),
      };

      setScanResults((prev) => {
        const next = new Map(prev);
        next.set(apiId, result);
        return next;
      });

      // Build and persist scan summary
      const findingCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      for (const f of findings) {
        if (f.severity === Severity.Critical) findingCounts.critical++;
        else if (f.severity === Severity.High) findingCounts.high++;
        else if (f.severity === Severity.Medium) findingCounts.medium++;
        else if (f.severity === Severity.Low) findingCounts.low++;
        else findingCounts.info++;
      }
      const summary: ApiScanSummary = {
        apiId,
        scannedAt: new Date().toISOString(),
        endpointCount,
        findingCounts,
        totalFindings: findings.length,
      };
      setPersistedSummaries((prev) => {
        const updated = { ...prev, [apiId]: summary };
        settingsServiceRef.current.saveScanSummary(updated).catch(() => {
          // Non-critical — summary persistence is best-effort
        });
        return updated;
      });

      // Persist full findings
      settingsServiceRef.current
        .saveScanFindings(apiId, findings, new Date().toISOString())
        .catch(() => {
          // Non-critical
        });

      // Update API metadata
      try {
        await settings.updateApi(apiId, {
          lastScannedAt: new Date().toISOString(),
          lastFindingCount: findings.length,
          lastEndpointCount: endpointCount,
        });
      } catch {
        // Non-critical — scan results are already stored locally
      }

      return result;
    },
    [settings.apis, settings.globalSettings, settings.lintOverrides, settings.updateApi]
  );

  const handleScanAll = React.useCallback(async () => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    setScanning(true);
    setScanErrors(new Map());

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const errors = new Map<string, string>();
    const apis = [...settings.apis];
    let completed = 0;

    try {
      // Process in batches of SCAN_CONCURRENCY
      for (let i = 0; i < apis.length; i += SCAN_CONCURRENCY) {
        if (controller.signal.aborted) break;
        const batch = apis.slice(i, i + SCAN_CONCURRENCY);
        const promises = batch.map(async (api) => {
          setScanProgress({
            phase: `Scanning ${api.name}`,
            current: completed + 1,
            total: apis.length,
          });
          try {
            await scanApi(api.id, controller.signal);
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
            errors.set(api.id, `Failed to scan ${api.name}: ${formatError(err)}`);
          } finally {
            completed++;
            setScanProgress({
              phase: `Scanned ${api.name}`,
              current: completed,
              total: apis.length,
            });
          }
        });
        await Promise.all(promises);
      }
    } finally {
      setScanning(false);
      setScanProgress(null);
      scanLockRef.current = false;
      abortControllerRef.current = null;
      if (errors.size > 0) {
        setScanErrors(errors);
      }
    }
  }, [settings.apis, scanApi]);

  const handleCancelScan = React.useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleScanOne = React.useCallback(
    async (apiId: string) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;
      setScanning(true);
      setScanErrors((prev) => {
        const next = new Map(prev);
        next.delete(apiId);
        return next;
      });

      const api = settings.apis.find((a) => a.id === apiId);
      setScanProgress({
        phase: `Scanning ${api?.name ?? "API"}`,
        current: 1,
        total: 1,
      });

      try {
        await scanApi(apiId);
      } catch (err) {
        setScanErrors((prev) => {
          const next = new Map(prev);
          next.set(apiId, `Failed to scan: ${formatError(err)}`);
          return next;
        });
      } finally {
        setScanning(false);
        setScanProgress(null);
        scanLockRef.current = false;
      }
    },
    [settings.apis, scanApi]
  );

  // --- Discovery handlers ---
  const handleDiscover = React.useCallback(async () => {
    setDiscovering(true);
    setDiscoveryError(null);
    try {
      const results = await discoveryServiceRef.current.discoverApis();
      setDiscoveredApis(results);
    } catch (err) {
      setDiscoveryError(formatError(err));
    } finally {
      setDiscovering(false);
    }
  }, []);

  const handleImportDiscovered = React.useCallback(
    async (api: DiscoveredApi) => {
      await settings.addApi({
        id: generateId(),
        name: api.suggestedName,
        url: api.rawUrl,
        addedAt: new Date().toISOString(),
        addedBy: admin.currentUserId,
        visibility: ApiVisibility.Private,
        publishStatus: ApiPublishStatus.Unpublished,
      });
      // Remove from discovered list so the UI updates
      setDiscoveredApis((prev) => prev.filter((d) => d.rawUrl !== api.rawUrl));
    },
    [settings.addApi, admin.currentUserId]
  );

  const handleSelectApiFromDashboard = React.useCallback(
    (apiId: string) => {
      setSelectedApiId(apiId);
      // If we have scan results, go to detail view; otherwise go to analysis
      setActiveView(scanResults.has(apiId) ? "detail" : "analysis");
    },
    [scanResults]
  );

  const handleBackFromDetail = React.useCallback(() => {
    setActiveView("dashboard");
  }, []);

  // Load persisted scan summaries on mount
  React.useEffect(() => {
    if (!settings.loading) {
      settingsServiceRef.current
        .loadScanSummary()
        .then((summaries) => {
          if (summaries) {
            setPersistedSummaries(summaries);
          }
        })
        .catch(() => {
          // Non-critical
        });
    }
  }, [settings.loading]);

  // Auto-scan on load when the setting is enabled
  React.useEffect(() => {
    if (
      !settings.loading &&
      !autoScanFiredRef.current &&
      settings.globalSettings?.autoScanOnLoad &&
      !scanLockRef.current
    ) {
      autoScanFiredRef.current = true;
      handleScanAll();
    }
  }, [settings.loading, settings.globalSettings?.autoScanOnLoad, handleScanAll]);

  // Track previous API ids to auto-scan newly added APIs
  const prevApiIdsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (settings.loading) return;
    const currentIds = new Set(settings.apis.map((a) => a.id));
    const prevIds = prevApiIdsRef.current;

    // Find newly added API ids
    if (prevIds.size > 0) {
      for (const id of currentIds) {
        if (!prevIds.has(id) && !scanLockRef.current) {
          handleScanOne(id);
          break; // scan one at a time to avoid lock conflicts
        }
      }
    }
    prevApiIdsRef.current = currentIds;
  }, [settings.apis, settings.loading, handleScanOne]);

  // Periodic auto-refresh timer
  React.useEffect(() => {
    const intervalMinutes = settings.globalSettings?.refreshIntervalMinutes ?? 0;
    if (!intervalMinutes || intervalMinutes <= 0 || settings.loading) return;

    const intervalMs = intervalMinutes * 60 * 1000;
    const timer = setInterval(() => {
      if (!scanLockRef.current) {
        handleScanAll();
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [settings.globalSettings?.refreshIntervalMinutes, settings.loading, handleScanAll]);

  // Loading state
  if (admin.loading || settings.loading) {
    return (
      <Gate title="Loading Swagger Manager" busy>
        <p className="ax-gate__body">Loading settings and admin access.</p>
      </Gate>
    );
  }

  // Unclaimed: show the claim page
  if (admin.isUnclaimed) {
    return (
      <AdminClaimPage
        currentUserName={admin.currentUserName}
        onClaim={admin.claimAdmin}
        error={admin.error}
      />
    );
  }

  const totalFindings = Array.from(scanResults.values()).reduce(
    (sum, r) => sum + r.findings.length,
    0
  );

  const tabs = [
    {
      id: "dashboard",
      label: "API Dashboard",
      count: settings.apis.length > 0 ? settings.apis.length : undefined,
    },
    {
      id: "analysis",
      label: "API Analysis",
      count: totalFindings > 0 ? totalFindings : undefined,
    },
    {
      id: "rules",
      label: "Lint Rules",
      count: settings.lintOverrides.length > 0 ? settings.lintOverrides.length : undefined,
    },
    ...(admin.isAdmin
      ? [
          { id: "settings", label: "Settings" },
          { id: "admin", label: "Admin" },
        ]
      : []),
  ];

  return (
    <AppShell
      title={BRAND.name}
      subtitle={BRAND.tagline}
      mark={<BrandGlyph />}
      actions={
        admin.currentUserName ? (
          <>
            <span className="ax-fine">{admin.currentUserName}</span>
            <Pill tone={admin.isAdmin ? "accent" : "neutral"}>
              {admin.isAdmin ? "Admin" : "Read-only"}
            </Pill>
          </>
        ) : undefined
      }
    >
      {!admin.isAdmin && showReadOnlyNotice && (
        <Banner tone="info" title="Read-only access" onDismiss={() => setShowReadOnlyNotice(false)}>
          You can browse APIs, scan results and lint rules. Contact an admin to register APIs,
          change settings or create bugs.
        </Banner>
      )}

      <Tabs
        tabs={tabs}
        active={activeView === "detail" ? "dashboard" : activeView}
        onChange={(id) => setActiveView(id as ViewMode)}
        aria-label="Swagger Manager sections"
      />

      {/* Global errors (non-per-API) */}
      {(admin.error || settings.error) && (
        <div className="ax-section">
          <Banner tone="error">{admin.error || settings.error}</Banner>
        </div>
      )}

      {activeView === "dashboard" && (
        <ApiDashboard
          apis={settings.apis}
          scanResults={scanResults}
          persistedSummaries={persistedSummaries}
          scanning={scanning}
          progress={scanProgress}
          scanErrors={scanErrors}
          onScanAll={handleScanAll}
          onCancelScan={handleCancelScan}
          onScanOne={handleScanOne}
          onSelectApi={handleSelectApiFromDashboard}
          isAdmin={admin.isAdmin}
          onDiscover={handleDiscover}
          discovering={discovering}
          discoveredApis={discoveredApis}
          onImportDiscovered={handleImportDiscovered}
          discoveryError={discoveryError}
        />
      )}

      {activeView === "detail" && selectedApiId && scanResults.get(selectedApiId) && (
        <ApiDetailPage
          result={scanResults.get(selectedApiId)!}
          onBack={handleBackFromDetail}
          isAdmin={admin.isAdmin}
          bugMappings={bugMappings}
          onBugCreated={handleBugCreated}
        />
      )}

      {activeView === "analysis" && (
        <ApiAnalysis
          apis={settings.apis}
          scanResults={scanResults}
          selectedApiId={selectedApiId}
          onSelectApi={setSelectedApiId}
        />
      )}

      {activeView === "rules" && (
        <LintRulesPanel
          overrides={settings.lintOverrides}
          onSave={settings.saveLintOverrides}
          isAdmin={admin.isAdmin}
        />
      )}

      {activeView === "settings" && admin.isAdmin && (
        <SettingsPanel
          globalSettings={settings.globalSettings}
          apis={settings.apis}
          currentUserId={admin.currentUserId}
          onSaveSettings={settings.saveGlobalSettings}
          onAddApi={settings.addApi}
          onRemoveApi={settings.removeApi}
          onUpdateApi={settings.updateApi}
        />
      )}

      {activeView === "admin" && admin.isAdmin && admin.adminDoc && (
        <AdminPanel
          adminDoc={admin.adminDoc}
          currentUserId={admin.currentUserId}
          onAddAdmin={admin.addAdmin}
          onRemoveAdmin={admin.removeAdmin}
          error={admin.error}
        />
      )}
    </AppShell>
  );
};

export const App: React.FC = () => (
  <ErrorBoundary>
    <AppInner />
  </ErrorBoundary>
);
