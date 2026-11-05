import * as React from "react";
import { LintFinding, Severity } from "../models/interfaces";
import { WorkItemService, CreateBugParams, CreatedWorkItem } from "../services/WorkItemService";
import { SEVERITY_LABEL, SEVERITY_TONE } from "../utils/constants";
import { Banner, Button, Modal, Pill } from "./ui";

interface CreateBugDialogProps {
  finding: LintFinding;
  apiName: string;
  onClose: () => void;
  onCreated: (workItem: CreatedWorkItem) => void;
}

const severityToDevOps: Record<Severity, { severity: string; priority: number }> = {
  [Severity.Critical]: { severity: "1 - Critical", priority: 1 },
  [Severity.High]: { severity: "2 - High", priority: 2 },
  [Severity.Medium]: { severity: "3 - Medium", priority: 3 },
  [Severity.Low]: { severity: "4 - Low", priority: 4 },
};

/** Spec text ends up in HTML, so escape it before it goes into the bug description. */
const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const CreateBugDialog: React.FC<CreateBugDialogProps> = ({
  finding,
  apiName,
  onClose,
  onCreated,
}) => {
  const serviceRef = React.useRef(new WorkItemService());
  const ids = React.useId();

  const defaultTitle = `[Swagger Lint] ${finding.ruleName}: ${finding.path}${finding.method ? ` (${finding.method})` : ""}`;
  const defaultDescription = [
    `<h3>Swagger Lint Issue</h3>`,
    `<p><strong>API:</strong> ${esc(apiName)}</p>`,
    `<p><strong>Rule:</strong> ${esc(finding.ruleName)} (<code>${esc(finding.ruleId)}</code>)</p>`,
    `<p><strong>Category:</strong> ${esc(finding.category)}</p>`,
    `<p><strong>Severity:</strong> ${esc(finding.severity)}</p>`,
    `<p><strong>Path:</strong> <code>${esc(finding.path)}</code></p>`,
    finding.method ? `<p><strong>Method:</strong> ${esc(finding.method)}</p>` : "",
    `<p><strong>Issue:</strong> ${esc(finding.message)}</p>`,
    finding.suggestion ? `<p><strong>Suggestion:</strong> ${esc(finding.suggestion)}</p>` : "",
    `<hr>`,
    `<p><em>Created by Swagger Manager extension</em></p>`,
  ]
    .filter(Boolean)
    .join("\n");

  const [title, setTitle] = React.useState(defaultTitle);
  const [description] = React.useState(defaultDescription);
  const [areaPath, setAreaPath] = React.useState("");
  const [parentId, setParentId] = React.useState("");
  const [areaPaths, setAreaPaths] = React.useState<string[]>([]);
  const [loadingAreas, setLoadingAreas] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    serviceRef.current
      .getAreaPaths()
      .then((paths) => {
        setAreaPaths(paths);
        if (paths.length > 0) setAreaPath(paths[0]);
      })
      .catch(() => setAreaPaths([]))
      .finally(() => setLoadingAreas(false));
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setCreating(true);
    setError(null);

    const devOpsSev = severityToDevOps[finding.severity];
    const params: CreateBugParams = {
      title: title.trim(),
      description,
      severity: devOpsSev.severity,
      priority: devOpsSev.priority,
      tags: "swagger-lint",
    };
    if (areaPath) params.areaPath = areaPath;
    if (parentId.trim()) {
      const parsed = parseInt(parentId.trim(), 10);
      if (isNaN(parsed)) {
        setError("Parent ID must be a number.");
        setCreating(false);
        return;
      }
      params.parentId = parsed;
    }

    try {
      const workItem = await serviceRef.current.createBug(params);
      onCreated(workItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const bannerTone =
    finding.severity === Severity.Critical
      ? "error"
      : finding.severity === Severity.High
        ? "warn"
        : "info";

  return (
    <Modal
      title="Create Bug from Lint Finding"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} busy={creating}>
            {creating ? "Creating..." : "Create Bug"}
          </Button>
        </>
      }
    >
      <Banner
        tone={bannerTone}
        title={
          <span className="ax-row">
            <Pill tone={SEVERITY_TONE[finding.severity]}>{SEVERITY_LABEL[finding.severity]}</Pill>
            <span>{finding.ruleName}</span>
          </span>
        }
      >
        {finding.message}
      </Banner>

      {error && (
        <div style={{ marginTop: 12 }}>
          <Banner tone="error" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        </div>
      )}

      <div className="ax-stack" style={{ marginTop: 16 }}>
        <div className="ax-field" style={{ marginBottom: 0 }}>
          <label className="ax-label" htmlFor={`${ids}-title`}>
            Title
          </label>
          <input
            id={`${ids}-title`}
            className="ax-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="ax-field" style={{ marginBottom: 0 }}>
          <label className="ax-label" htmlFor={`${ids}-area`}>
            Area Path
          </label>
          {loadingAreas ? (
            <span className="ax-help">Loading area paths...</span>
          ) : areaPaths.length > 0 ? (
            <select
              id={`${ids}-area`}
              className="ax-select"
              value={areaPath}
              onChange={(e) => setAreaPath(e.target.value)}
            >
              {areaPaths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${ids}-area`}
              className="ax-input"
              type="text"
              value={areaPath}
              onChange={(e) => setAreaPath(e.target.value)}
              placeholder={"e.g. Contoso\\Team\\Area"}
            />
          )}
        </div>

        <div className="ax-field" style={{ marginBottom: 0 }}>
          <label className="ax-label" htmlFor={`${ids}-parent`}>
            Parent Work Item ID (Feature / Epic)
          </label>
          <input
            id={`${ids}-parent`}
            className="ax-input"
            type="text"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            placeholder="e.g. 12345 (optional)"
          />
          <span className="ax-help">Links the bug as a child of this feature, epic, or PBI</span>
        </div>
      </div>
    </Modal>
  );
};
