import * as React from "react";
import {
  ApiScanResult,
  LintFinding,
  Severity,
  RuleCategory,
  SwaggerApiEntry,
} from "../models/interfaces";
import { CATEGORY_LABEL, SEVERITY_LABEL, SEVERITY_ORDER, SEVERITY_TONE } from "../utils/constants";
import { Card, Disclosure, EmptyState, IconInfo, IconSearch, Pill } from "./ui";

interface ApiAnalysisProps {
  apis: SwaggerApiEntry[];
  scanResults: Map<string, ApiScanResult>;
  selectedApiId: string | null;
  onSelectApi: (apiId: string | null) => void;
}

export const ApiAnalysis: React.FC<ApiAnalysisProps> = ({
  apis,
  scanResults,
  selectedApiId,
  onSelectApi,
}) => {
  const [filterSeverity, setFilterSeverity] = React.useState<Severity | "all">("all");
  const [filterCategory, setFilterCategory] = React.useState<RuleCategory | "all">("all");
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = React.useState("");

  const result = selectedApiId ? scanResults.get(selectedApiId) : null;

  if (scanResults.size === 0) {
    return (
      <Card>
        <EmptyState title="No scan results yet." icon={<IconInfo size={26} />}>
          Run a scan from the Dashboard tab first.
        </EmptyState>
      </Card>
    );
  }

  const filteredFindings = result
    ? result.findings.filter((f) => {
        if (filterSeverity !== "all" && f.severity !== filterSeverity) return false;
        if (filterCategory !== "all" && f.category !== filterCategory) return false;
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          return (
            f.path.toLowerCase().includes(term) ||
            f.message.toLowerCase().includes(term) ||
            f.ruleName.toLowerCase().includes(term) ||
            (f.method?.toLowerCase().includes(term) ?? false)
          );
        }
        return true;
      })
    : [];

  // Group findings by path
  const findingsByPath = new Map<string, LintFinding[]>();
  for (const f of filteredFindings) {
    const key = f.path;
    if (!findingsByPath.has(key)) findingsByPath.set(key, []);
    findingsByPath.get(key)!.push(f);
  }

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div>
      <div className="ax-toolbar">
        <select
          className="ax-select"
          aria-label="API"
          value={selectedApiId ?? ""}
          onChange={(e) => onSelectApi(e.target.value || null)}
          style={{ minWidth: 200 }}
        >
          <option value="">Select an API...</option>
          {apis.map((api) => {
            const r = scanResults.get(api.id);
            return (
              <option key={api.id} value={api.id}>
                {api.name}
                {r ? ` (${r.findings.length} issues)` : ""}
              </option>
            );
          })}
        </select>

        {result && (
          <>
            <select
              className="ax-select"
              aria-label="Severity"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value as Severity | "all")}
            >
              <option value="all">All Severities</option>
              {Object.values(Severity).map((sev) => (
                <option key={sev} value={sev}>
                  {SEVERITY_LABEL[sev]}
                </option>
              ))}
            </select>

            <select
              className="ax-select"
              aria-label="Category"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as RuleCategory | "all")}
            >
              <option value="all">All Categories</option>
              {Object.values(RuleCategory).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABEL[cat]}
                </option>
              ))}
            </select>

            <div className="ax-search">
              <span className="ax-search__icon">
                <IconSearch />
              </span>
              <input
                className="ax-input"
                type="text"
                aria-label="Search findings"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search paths, rules..."
              />
            </div>

            <span className="ax-fine">
              {filteredFindings.length} of {result.findings.length} issues
            </span>
          </>
        )}
      </div>

      {!result && (
        <Card>
          <EmptyState title="Select an API" icon={<IconSearch size={26} />}>
            Pick a scanned API above to browse its findings.
          </EmptyState>
        </Card>
      )}

      {result && (
        <Card title="Specification">
          <dl className="ax-kv" style={{ margin: 0 }}>
            <dt>Title</dt>
            <dd>{result.spec.info.title}</dd>
            <dt>Version</dt>
            <dd>{result.spec.info.version}</dd>
            <dt>Spec</dt>
            <dd>{result.spec.openapi || result.spec.swagger || "unknown"}</dd>
            <dt>Endpoints</dt>
            <dd>{result.endpointCount}</dd>
          </dl>
        </Card>
      )}

      {result && findingsByPath.size === 0 && (
        <Card>
          <EmptyState title="No issues to show" icon={<IconInfo size={26} />}>
            {filteredFindings.length === 0 && result.findings.length === 0
              ? "No issues found! This API looks clean."
              : "No issues match your current filters."}
          </EmptyState>
        </Card>
      )}

      {Array.from(findingsByPath.entries())
        .sort(([, a], [, b]) => {
          const aMin = Math.min(...a.map((f) => SEVERITY_ORDER[f.severity]));
          const bMin = Math.min(...b.map((f) => SEVERITY_ORDER[f.severity]));
          return aMin - bMin;
        })
        .map(([path, findings]) => {
          const worstSeverity = findings.reduce(
            (worst, f) => (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[worst] ? f.severity : worst),
            Severity.Low
          );

          return (
            <Disclosure
              key={path}
              open={expandedPaths.has(path)}
              onToggle={() => togglePath(path)}
              summary={
                <span className="ax-row">
                  <span className="ax-mono">{path}</span>
                  <span className="ax-spacer" />
                  <Pill tone={SEVERITY_TONE[worstSeverity]}>
                    {findings.length} {findings.length === 1 ? "issue" : "issues"}
                  </Pill>
                </span>
              }
            >
              <div className="ax-stack">
                {findings.map((f, idx) => (
                  <div key={idx}>
                    <div className="ax-row">
                      <Pill tone={SEVERITY_TONE[f.severity]}>{SEVERITY_LABEL[f.severity]}</Pill>
                      {f.method && <Pill>{f.method}</Pill>}
                      <span className="ax-fine">{f.ruleName}</span>
                    </div>
                    <div>{f.message}</div>
                    {f.suggestion && <div className="ax-help">Suggestion: {f.suggestion}</div>}
                  </div>
                ))}
              </div>
            </Disclosure>
          );
        })}
    </div>
  );
};
