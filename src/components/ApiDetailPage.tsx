import * as React from "react";
import {
  ApiScanResult,
  LintFinding,
  Severity,
  RuleCategory,
  OperationObject,
  ApiVisibility,
  ApiPublishStatus,
} from "../models/interfaces";
import { CATEGORY_LABEL, SEVERITY_LABEL, SEVERITY_TONE } from "../utils/constants";
import { CreateBugDialog } from "./CreateBugDialog";
import { CreatedWorkItem } from "../services/WorkItemService";
import { Banner, Button, Card, Disclosure, IconExternal, Metric, Pill, Tone } from "./ui";

interface ApiDetailPageProps {
  result: ApiScanResult;
  onBack: () => void;
  isAdmin: boolean;
  bugMappings: Map<string, CreatedWorkItem>;
  onBugCreated: (findingKey: string, workItem: CreatedWorkItem) => void;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"] as const;

const METHOD_TONE: Record<string, Tone> = {
  GET: "success",
  POST: "info",
  PUT: "warn",
  PATCH: "accent",
  DELETE: "danger",
  OPTIONS: "neutral",
  HEAD: "neutral",
};

const statusTone = (code: string): Tone => {
  const n = parseInt(code, 10);
  if (n >= 400) return "danger";
  if (n >= 200 && n < 300) return "success";
  return "neutral";
};

const SEVERITY_METRIC_TONE = {
  [Severity.Critical]: "danger",
  [Severity.High]: "warn",
  [Severity.Medium]: "info",
  [Severity.Low]: "neutral",
} as const;

export const ApiDetailPage: React.FC<ApiDetailPageProps> = ({
  result,
  onBack,
  isAdmin,
  bugMappings,
  onBugCreated,
}) => {
  const { spec, findings, api } = result;
  const [expandedEndpoints, setExpandedEndpoints] = React.useState<Set<string>>(new Set());
  const [bugDialogFinding, setBugDialogFinding] = React.useState<LintFinding | null>(null);
  const [showRawSpec, setShowRawSpec] = React.useState(false);

  // Build endpoint list
  const endpoints: { path: string; method: string; op: OperationObject }[] = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method] as OperationObject | undefined;
      if (op) {
        endpoints.push({ path, method: method.toUpperCase(), op });
      }
    }
  }

  // Build findings map by path+method
  const findingsByEndpoint = new Map<string, LintFinding[]>();
  for (const f of findings) {
    const key = f.method ? `${f.method}::${f.path}` : `::${f.path}`;
    if (!findingsByEndpoint.has(key)) findingsByEndpoint.set(key, []);
    findingsByEndpoint.get(key)!.push(f);
  }

  // Global findings (not tied to a specific endpoint)
  const globalFindings = findings.filter((f) => f.path === "(global)" || f.path.startsWith("#/"));

  const toggleEndpoint = (key: string) => {
    setExpandedEndpoints((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const makeFindingKey = (f: LintFinding): string => `${f.ruleId}::${f.path}::${f.method ?? ""}`;

  const handleBugCreated = (finding: LintFinding, workItem: CreatedWorkItem) => {
    const key = makeFindingKey(finding);
    onBugCreated(key, workItem);
    setBugDialogFinding(null);
  };

  const getBugForFinding = (f: LintFinding): CreatedWorkItem | undefined => {
    return bugMappings.get(makeFindingKey(f));
  };

  // Severity summary
  const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) sevCounts[f.severity]++;

  // Category summary
  const catCounts: Record<string, number> = {};
  for (const f of findings) {
    catCounts[f.category] = (catCounts[f.category] || 0) + 1;
  }

  const schemas = spec.components?.schemas || spec.definitions || {};

  return (
    <div>
      {bugDialogFinding && (
        <CreateBugDialog
          finding={bugDialogFinding}
          apiName={api.name}
          onClose={() => setBugDialogFinding(null)}
          onCreated={(wi) => handleBugCreated(bugDialogFinding, wi)}
        />
      )}

      <div className="ax-toolbar">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back to Dashboard
        </Button>
      </div>

      <Card
        title={spec.info.title}
        hint={spec.info.description}
        actions={
          <Button size="sm" aria-pressed={showRawSpec} onClick={() => setShowRawSpec(!showRawSpec)}>
            {showRawSpec ? "Hide" : "View"} Raw Spec
          </Button>
        }
      >
        <div className="ax-row">
          <Pill>v{spec.info.version}</Pill>
          <Pill>
            {spec.openapi
              ? `OpenAPI ${spec.openapi}`
              : spec.swagger
                ? `Swagger ${spec.swagger}`
                : "Unknown"}
          </Pill>
          <Pill tone={api.visibility === ApiVisibility.Public ? "success" : "neutral"}>
            {api.visibility}
          </Pill>
          <Pill tone={api.publishStatus === ApiPublishStatus.Published ? "info" : "neutral"}>
            {api.publishStatus}
          </Pill>
        </div>
        <p className="ax-fine" style={{ margin: "12px 0 0" }}>
          {endpoints.length} endpoints &middot; {Object.keys(schemas).length} schemas &middot;
          Scanned {result.scannedAt.toLocaleString()}
        </p>
      </Card>

      {showRawSpec && (
        <Card title="Raw spec">
          <pre className="ax-diag__pre" style={{ maxHeight: 400, overflow: "auto" }}>
            {JSON.stringify(spec, null, 2)}
          </pre>
        </Card>
      )}

      {findings.length === 0 ? (
        <div className="ax-section">
          <Banner tone="success">No issues found - this API is clean!</Banner>
        </div>
      ) : (
        <>
          <div className="ax-metrics">
            <Metric label="Total Issues" value={findings.length} tone="danger" />
            {(Object.keys(sevCounts) as Severity[]).map(
              (sev) =>
                sevCounts[sev] > 0 && (
                  <Metric
                    key={sev}
                    label={SEVERITY_LABEL[sev]}
                    value={sevCounts[sev]}
                    tone={SEVERITY_METRIC_TONE[sev]}
                  />
                )
            )}
          </div>
          <div className="ax-row ax-section">
            <span className="ax-label">By category</span>
            {Object.entries(catCounts).map(([cat, count]) => (
              <Pill key={cat}>
                {CATEGORY_LABEL[cat as RuleCategory] ?? cat}: {count}
              </Pill>
            ))}
          </div>
        </>
      )}

      {globalFindings.length > 0 && (
        <Card title="Global Issues" hint="Findings that apply to the whole spec, not one endpoint.">
          <div className="ax-stack">
            {globalFindings.map((f, idx) => (
              <FindingRow
                key={idx}
                finding={f}
                bug={getBugForFinding(f)}
                onCreateBug={() => setBugDialogFinding(f)}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </Card>
      )}

      <h2>Endpoints ({endpoints.length})</h2>
      {endpoints.map(({ path, method, op }) => {
        const key = `${method}::${path}`;
        const endpointFindings = findingsByEndpoint.get(key) || [];

        return (
          <Disclosure
            key={key}
            open={expandedEndpoints.has(key)}
            onToggle={() => toggleEndpoint(key)}
            summary={
              <span className="ax-row">
                <Pill tone={METHOD_TONE[method] ?? "neutral"}>{method}</Pill>
                <span className="ax-mono">{path}</span>
                {op.summary && <span className="ax-fine">{op.summary}</span>}
                <span className="ax-spacer" />
                {op.tags?.map((tag) => (
                  <Pill key={tag}>{tag}</Pill>
                ))}
                {endpointFindings.length > 0 && (
                  <Pill tone="danger">
                    {endpointFindings.length} {endpointFindings.length === 1 ? "issue" : "issues"}
                  </Pill>
                )}
              </span>
            }
          >
            <div className="ax-stack">
              {op.operationId && (
                <div>
                  <strong>Operation ID:</strong> <code>{op.operationId}</code>
                </div>
              )}
              {op.description && <div className="ax-muted">{op.description}</div>}
              {op.parameters && op.parameters.length > 0 && (
                <div>
                  <strong>Parameters</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {op.parameters.map((p, pi) => (
                      <li key={pi}>
                        <code>{p.name}</code> <Pill>{p.in}</Pill>
                        {p.required && (
                          <>
                            {" "}
                            <Pill tone="danger">required</Pill>
                          </>
                        )}
                        {p.description && <span className="ax-muted"> - {p.description}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {op.responses && (
                <div>
                  <strong>Responses</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {Object.entries(op.responses).map(([code, resp]) => (
                      <li key={code}>
                        <Pill tone={statusTone(code)}>{code}</Pill>{" "}
                        <span className="ax-muted">{resp.description || "(no description)"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {endpointFindings.length > 0 && (
                <div>
                  <strong>Issues ({endpointFindings.length})</strong>
                  <div className="ax-stack" style={{ marginTop: 8 }}>
                    {endpointFindings.map((f, idx) => (
                      <FindingRow
                        key={idx}
                        finding={f}
                        bug={getBugForFinding(f)}
                        onCreateBug={() => setBugDialogFinding(f)}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Disclosure>
        );
      })}
    </div>
  );
};

const FindingRow: React.FC<{
  finding: LintFinding;
  bug?: CreatedWorkItem;
  onCreateBug: () => void;
  isAdmin: boolean;
}> = ({ finding, bug, onCreateBug, isAdmin }) => (
  <div className="ax-row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="ax-row">
        <Pill tone={SEVERITY_TONE[finding.severity]}>{SEVERITY_LABEL[finding.severity]}</Pill>
        <span className="ax-fine">{finding.ruleName}</span>
      </div>
      <div>{finding.message}</div>
      {finding.suggestion && <div className="ax-help">{finding.suggestion}</div>}
    </div>
    <div style={{ flexShrink: 0 }}>
      {bug ? (
        <a className="ax-link" href={bug.url} target="_blank" rel="noopener noreferrer">
          Bug #{bug.id} <IconExternal />
        </a>
      ) : isAdmin ? (
        <Button size="sm" onClick={onCreateBug}>
          Create Bug
        </Button>
      ) : null}
    </div>
  </div>
);
