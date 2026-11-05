import * as React from "react";
import {
  SwaggerApiEntry,
  ApiScanResult,
  ApiScanSummary,
  ScanProgress,
  Severity,
  ApiVisibility,
  ApiPublishStatus,
} from "../models/interfaces";
import { DiscoveredApi } from "../services/SwaggerDiscoveryService";
import { SEVERITY_LABEL } from "../utils/constants";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  IconPlay,
  IconSearch,
  IconStop,
  Metric,
  Pill,
  Progress,
} from "./ui";

interface ApiDashboardProps {
  apis: SwaggerApiEntry[];
  scanResults: Map<string, ApiScanResult>;
  persistedSummaries: Record<string, ApiScanSummary>;
  scanning: boolean;
  progress: ScanProgress | null;
  scanErrors: Map<string, string>;
  onScanAll: () => void;
  onCancelScan: () => void;
  onScanOne: (apiId: string) => void;
  onSelectApi: (apiId: string) => void;
  isAdmin: boolean;
  onDiscover: () => void;
  discovering: boolean;
  discoveredApis: DiscoveredApi[];
  onImportDiscovered: (api: DiscoveredApi) => void;
  discoveryError: string | null;
}

/** Threshold for considering persisted data "stale" — 24 hours. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const SEVERITY_METRIC_TONE = {
  [Severity.Critical]: "danger",
  [Severity.High]: "warn",
  [Severity.Medium]: "info",
  [Severity.Low]: "neutral",
} as const;

export const ApiDashboard: React.FC<ApiDashboardProps> = ({
  apis,
  scanResults,
  persistedSummaries,
  scanning,
  progress,
  scanErrors,
  onScanAll,
  onCancelScan,
  onScanOne,
  onSelectApi,
  isAdmin,
  onDiscover,
  discovering,
  discoveredApis,
  onImportDiscovered,
  discoveryError,
}) => {
  if (apis.length === 0) {
    return (
      <div className="ax-stack">
        <Card>
          <EmptyState
            title="No Swagger APIs registered yet."
            icon={<IconSearch size={26} />}
            action={
              isAdmin ? (
                <Button
                  variant="primary"
                  icon={<IconSearch />}
                  onClick={onDiscover}
                  busy={discovering}
                >
                  {discovering ? "Scanning Repositories..." : "Discover APIs in Repositories"}
                </Button>
              ) : undefined
            }
          >
            {isAdmin ? (
              <>
                Scan your repositories to automatically find Swagger/OpenAPI specs, or add them
                manually in <strong>Settings</strong>.
              </>
            ) : (
              "Contact an admin to register Swagger API endpoints."
            )}
          </EmptyState>
        </Card>
        {discoveryError && <Banner tone="error">{discoveryError}</Banner>}
        {discoveredApis.length > 0 && (
          <DiscoveredApiList
            discoveredApis={discoveredApis}
            existingUrls={new Set()}
            onImport={onImportDiscovered}
          />
        )}
      </div>
    );
  }

  // Merge live scan results with persisted summaries for stats
  const hasLiveResults = scanResults.size > 0;
  const hasPersisted = Object.keys(persistedSummaries).length > 0;
  const hasAnyData = hasLiveResults || hasPersisted;

  let totalFindings = 0;
  let totalEndpoints = 0;
  let apisScannedCount = 0;
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  if (hasLiveResults) {
    totalFindings = Array.from(scanResults.values()).reduce((sum, r) => sum + r.findings.length, 0);
    totalEndpoints = Array.from(scanResults.values()).reduce((sum, r) => sum + r.endpointCount, 0);
    apisScannedCount = scanResults.size;
    for (const result of scanResults.values()) {
      for (const f of result.findings) {
        severityCounts[f.severity]++;
      }
    }
  } else if (hasPersisted) {
    for (const summary of Object.values(persistedSummaries)) {
      totalFindings += summary.totalFindings;
      totalEndpoints += summary.endpointCount;
      apisScannedCount++;
      severityCounts.critical += summary.findingCounts.critical;
      severityCounts.high += summary.findingCounts.high;
      severityCounts.medium += summary.findingCounts.medium;
      severityCounts.low += summary.findingCounts.low;
    }
  }

  const isStale =
    !hasLiveResults &&
    hasPersisted &&
    Date.now() -
      Object.values(persistedSummaries).reduce(
        (min, s) => Math.min(min, new Date(s.scannedAt).getTime()),
        Infinity
      ) >
      STALE_THRESHOLD_MS;

  return (
    <div>
      <div className="ax-toolbar">
        {scanning ? (
          <>
            <Button variant="primary" busy>
              Scanning...
            </Button>
            <Button variant="danger" icon={<IconStop />} onClick={onCancelScan}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="primary" icon={<IconPlay />} onClick={onScanAll}>
            Scan All APIs
          </Button>
        )}
      </div>

      {progress && (
        <div className="ax-section">
          <Progress label={progress.phase} current={progress.current} total={progress.total} />
        </div>
      )}

      {isStale && (
        <div className="ax-section">
          <Banner tone="warn">
            Scan data is more than 24 hours old. Click "Scan All APIs" to refresh.
          </Banner>
        </div>
      )}

      {hasAnyData && (
        <div className="ax-metrics">
          <Metric label="APIs Scanned" value={apisScannedCount} tone="accent" />
          <Metric label="Total Endpoints" value={totalEndpoints} tone="success" />
          <Metric
            label="Total Issues"
            value={totalFindings}
            tone={totalFindings > 0 ? "danger" : "success"}
          />
          {(Object.keys(severityCounts) as Severity[]).map((sev) =>
            severityCounts[sev] > 0 ? (
              <Metric
                key={sev}
                label={SEVERITY_LABEL[sev]}
                value={severityCounts[sev]}
                tone={SEVERITY_METRIC_TONE[sev]}
              />
            ) : null
          )}
        </div>
      )}

      <Card title="Registered APIs" hint={`${apis.length} registered`} flush>
        <div className="ax-table-wrap">
          <table className="ax-table">
            <thead>
              <tr>
                <th>API</th>
                <th className="ax-num">Endpoints</th>
                <th>Issues</th>
                <th>Last scan</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {apis.map((api) => {
                const result = scanResults.get(api.id);
                const persisted = persistedSummaries[api.id];
                const issueCount = result
                  ? result.findings.length
                  : persisted
                    ? persisted.totalFindings
                    : null;
                const endpointCount = result
                  ? result.endpointCount
                  : persisted
                    ? persisted.endpointCount
                    : null;
                const scannedLabel = result
                  ? `Scanned ${result.scannedAt.toLocaleTimeString()}`
                  : persisted
                    ? `Last scan: ${new Date(persisted.scannedAt).toLocaleString()}`
                    : null;
                const apiError = scanErrors.get(api.id);

                return (
                  <tr key={api.id}>
                    <td>
                      <div className="ax-row">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSelectApi(api.id)}
                          title="Open API details"
                        >
                          {api.name}
                        </Button>
                        <Pill
                          tone={api.visibility === ApiVisibility.Public ? "success" : "neutral"}
                        >
                          {api.visibility ?? "private"}
                        </Pill>
                        <Pill
                          tone={
                            api.publishStatus === ApiPublishStatus.Published ? "info" : "neutral"
                          }
                        >
                          {api.publishStatus ?? "unpublished"}
                        </Pill>
                      </div>
                      <div className="ax-fine ax-truncate" title={api.url}>
                        {api.url}
                      </div>
                      {apiError && (
                        <div role="alert" className="ax-fine" style={{ color: "var(--ax-danger)" }}>
                          {apiError}
                        </div>
                      )}
                    </td>
                    <td className="ax-num">{endpointCount !== null ? endpointCount : "-"}</td>
                    <td>
                      {issueCount !== null ? (
                        <Pill tone={issueCount === 0 ? "success" : "danger"}>
                          {issueCount === 0 ? "Clean" : `${issueCount} issues`}
                        </Pill>
                      ) : (
                        <span className="ax-muted">-</span>
                      )}
                      {!result && persisted && persisted.totalFindings > 0 && (
                        <div className="ax-fine">
                          {(
                            [
                              Severity.Critical,
                              Severity.High,
                              Severity.Medium,
                              Severity.Low,
                            ] as const
                          )
                            .filter((sev) => persisted.findingCounts[sev] > 0)
                            .map((sev) => `${persisted.findingCounts[sev]} ${sev}`)
                            .join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="ax-muted">{scannedLabel ?? "Not scanned yet"}</td>
                    <td className="ax-num">
                      <Button size="sm" onClick={() => onScanOne(api.id)} disabled={scanning}>
                        {result ? "Rescan" : "Scan"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {isAdmin && (
        <div className="ax-stack">
          <div className="ax-toolbar" style={{ marginBottom: 0 }}>
            <Button icon={<IconSearch />} onClick={onDiscover} busy={discovering}>
              {discovering ? "Scanning Repositories..." : "Discover More APIs"}
            </Button>
          </div>
          {discoveryError && <Banner tone="error">{discoveryError}</Banner>}
          {discoveredApis.length > 0 && (
            <DiscoveredApiList
              discoveredApis={discoveredApis}
              existingUrls={new Set(apis.map((a) => a.url))}
              onImport={onImportDiscovered}
            />
          )}
        </div>
      )}
    </div>
  );
};

const DiscoveredApiList: React.FC<{
  discoveredApis: DiscoveredApi[];
  existingUrls: Set<string>;
  onImport: (api: DiscoveredApi) => void;
}> = ({ discoveredApis, existingUrls, onImport }) => (
  <Card
    title="Discovered Swagger/OpenAPI specs"
    hint={`${discoveredApis.length} found in your repositories`}
    flush
  >
    <div className="ax-table-wrap">
      <table className="ax-table">
        <thead>
          <tr>
            <th>Repository</th>
            <th>File Path</th>
            <th>Suggested Name</th>
            <th aria-label="Action" />
          </tr>
        </thead>
        <tbody>
          {discoveredApis.map((api, i) => {
            const alreadyAdded = existingUrls.has(api.rawUrl);
            return (
              <tr key={`${api.repoId}-${api.filePath}-${i}`}>
                <td>{api.repoName}</td>
                <td className="ax-mono ax-truncate" title={api.filePath}>
                  {api.filePath}
                </td>
                <td>{api.suggestedName}</td>
                <td className="ax-num">
                  <Button
                    size="sm"
                    variant={alreadyAdded ? "default" : "primary"}
                    onClick={() => onImport(api)}
                    disabled={alreadyAdded}
                  >
                    {alreadyAdded ? "Added" : "Import"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </Card>
);
