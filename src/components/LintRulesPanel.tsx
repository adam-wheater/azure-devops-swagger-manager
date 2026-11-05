import * as React from "react";
import { LintRuleOverride, Severity, RuleCategory } from "../models/interfaces";
import { BUILT_IN_RULES, CATEGORY_LABEL, SEVERITY_LABEL, SEVERITY_TONE } from "../utils/constants";
import { Button, Card, IconSearch, Pill } from "./ui";

interface LintRulesPanelProps {
  overrides: LintRuleOverride[];
  onSave: (overrides: LintRuleOverride[]) => Promise<void>;
  isAdmin: boolean;
}

export const LintRulesPanel: React.FC<LintRulesPanelProps> = ({ overrides, onSave, isAdmin }) => {
  const [localOverrides, setLocalOverrides] = React.useState<Map<string, LintRuleOverride>>(
    new Map(overrides.map((o) => [o.ruleId, o]))
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filterCategory, setFilterCategory] = React.useState<RuleCategory | "all">("all");

  React.useEffect(() => {
    setLocalOverrides(new Map(overrides.map((o) => [o.ruleId, o])));
  }, [overrides]);

  const isEnabled = (ruleId: string): boolean => {
    const override = localOverrides.get(ruleId);
    return override ? override.enabled : true;
  };

  const getSeverity = (ruleId: string): Severity => {
    const override = localOverrides.get(ruleId);
    if (override?.severity) return override.severity;
    return BUILT_IN_RULES.find((r) => r.id === ruleId)?.defaultSeverity ?? Severity.Medium;
  };

  const toggleRule = (ruleId: string) => {
    if (!isAdmin) return;
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(ruleId);
      if (existing) {
        next.set(ruleId, { ...existing, enabled: !existing.enabled });
      } else {
        next.set(ruleId, { ruleId, enabled: false });
      }
      return next;
    });
  };

  const changeSeverity = (ruleId: string, severity: Severity) => {
    if (!isAdmin) return;
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(ruleId);
      if (existing) {
        next.set(ruleId, { ...existing, severity });
      } else {
        next.set(ruleId, { ruleId, enabled: true, severity });
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onSave(Array.from(localOverrides.values()));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setLocalOverrides(new Map());
  };

  const filteredRules = BUILT_IN_RULES.filter((rule) => {
    if (filterCategory !== "all" && rule.category !== filterCategory) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        rule.name.toLowerCase().includes(term) ||
        rule.description.toLowerCase().includes(term) ||
        rule.id.toLowerCase().includes(term)
      );
    }
    return true;
  });

  // Compare current local overrides against the persisted baseline to compute
  // the number of actually unsaved changes — not just the total override count.
  const persistedMap = React.useMemo(
    () => new Map(overrides.map((o) => [o.ruleId, o])),
    [overrides]
  );

  const changedCount = React.useMemo(() => {
    let count = 0;
    // Check for entries in localOverrides that differ from persisted
    for (const [ruleId, local] of localOverrides) {
      const persisted = persistedMap.get(ruleId);
      if (!persisted) {
        count++;
      } else if (persisted.enabled !== local.enabled || persisted.severity !== local.severity) {
        count++;
      }
    }
    // Check for entries in persisted that were removed from localOverrides
    for (const ruleId of persistedMap.keys()) {
      if (!localOverrides.has(ruleId)) {
        count++;
      }
    }
    return count;
  }, [localOverrides, persistedMap]);

  // Group by category
  const categories = Object.values(RuleCategory).map((key) => ({
    key,
    label: CATEGORY_LABEL[key],
  }));

  return (
    <Card
      title={`Lint Rules (${BUILT_IN_RULES.length})`}
      hint={
        isAdmin
          ? "Turn rules off or change their severity. Changes apply to the next scan once saved."
          : "Read-only. An admin can turn rules off or change their severity."
      }
      actions={
        isAdmin && (
          <>
            {saved && <Pill tone="success">Saved!</Pill>}
            <Button onClick={handleReset}>Reset to Defaults</Button>
            <Button variant="primary" onClick={handleSave} busy={saving}>
              {saving ? "Saving..." : `Save${changedCount > 0 ? ` (${changedCount} changed)` : ""}`}
            </Button>
          </>
        )
      }
    >
      <div className="ax-toolbar">
        <div className="ax-search">
          <span className="ax-search__icon">
            <IconSearch />
          </span>
          <input
            className="ax-input"
            type="text"
            aria-label="Search rules"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search rules..."
          />
        </div>
        <select
          className="ax-select"
          aria-label="Category"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as RuleCategory | "all")}
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.key} value={cat.key}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {categories
        .filter((cat) => filterCategory === "all" || filterCategory === cat.key)
        .map((cat) => {
          const rulesInCat = filteredRules.filter((r) => r.category === cat.key);
          if (rulesInCat.length === 0) return null;

          return (
            <section key={cat.key} className="ax-section">
              <h3>
                {cat.label} ({rulesInCat.length})
              </h3>
              <div className="ax-table-wrap">
                <table className="ax-table">
                  <thead>
                    <tr>
                      <th style={{ width: 56 }}>On</th>
                      <th>Rule</th>
                      <th style={{ width: 110 }}>Severity</th>
                      {isAdmin && <th style={{ width: 140 }}>Change</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rulesInCat.map((rule) => {
                      const enabled = isEnabled(rule.id);
                      const severity = getSeverity(rule.id);
                      const isCustomised = localOverrides.has(rule.id);

                      return (
                        <tr key={rule.id} style={{ opacity: enabled ? 1 : 0.55 }}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Enable ${rule.name}`}
                              checked={enabled}
                              onChange={() => toggleRule(rule.id)}
                              disabled={!isAdmin}
                            />
                          </td>
                          <td>
                            <div className="ax-row">
                              <strong>{rule.name}</strong>
                              {isCustomised && <Pill tone="accent">modified</Pill>}
                            </div>
                            <div className="ax-fine">{rule.description}</div>
                          </td>
                          <td>
                            <Pill tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Pill>
                          </td>
                          {isAdmin && (
                            <td>
                              <select
                                className="ax-select ax-input--sm"
                                aria-label={`Severity for ${rule.name}`}
                                value={severity}
                                onChange={(e) =>
                                  changeSeverity(rule.id, e.target.value as Severity)
                                }
                              >
                                {Object.values(Severity).map((sev) => (
                                  <option key={sev} value={sev}>
                                    {SEVERITY_LABEL[sev]}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
    </Card>
  );
};
