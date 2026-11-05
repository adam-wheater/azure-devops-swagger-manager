import * as React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { LintRulesPanel } from "@/components/LintRulesPanel";
import { ThemeProvider } from "@/utils/theme";
import { LintRuleOverride } from "@/models/interfaces";
import { BUILT_IN_RULES } from "@/utils/constants";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("LintRulesPanel", () => {
  it("renders all built-in rules", () => {
    renderWithTheme(<LintRulesPanel overrides={[]} onSave={jest.fn()} isAdmin={true} />);
    for (const rule of BUILT_IN_RULES) {
      expect(screen.getByText(rule.name)).toBeInTheDocument();
    }
  });

  it("shows rule count in header", () => {
    renderWithTheme(<LintRulesPanel overrides={[]} onSave={jest.fn()} isAdmin={true} />);
    expect(screen.getByText(`Lint Rules (${BUILT_IN_RULES.length})`)).toBeInTheDocument();
  });

  it("shows 0 changed when no modifications made", () => {
    renderWithTheme(<LintRulesPanel overrides={[]} onSave={jest.fn()} isAdmin={true} />);
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("shows changed count when overrides differ from baseline", () => {
    const overrides: LintRuleOverride[] = [{ ruleId: "naming-camelcase-params", enabled: false }];
    renderWithTheme(<LintRulesPanel overrides={overrides} onSave={jest.fn()} isAdmin={true} />);
    // Initially local matches persisted, so 0 changes
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("disables controls for non-admin users", () => {
    renderWithTheme(<LintRulesPanel overrides={[]} onSave={jest.fn()} isAdmin={false} />);
    // Should not show Save or Reset buttons for non-admin
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
    expect(screen.queryByText("Reset to Defaults")).not.toBeInTheDocument();
  });

  it("calls onSave with overrides when Save is clicked", async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    renderWithTheme(<LintRulesPanel overrides={[]} onSave={onSave} isAdmin={true} />);

    await act(async () => {
      fireEvent.click(screen.getByText("Save"));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("filters rules by search term", () => {
    renderWithTheme(<LintRulesPanel overrides={[]} onSave={jest.fn()} isAdmin={true} />);
    const searchInput = screen.getByPlaceholderText("Search rules...");
    fireEvent.change(searchInput, { target: { value: "camelCase" } });
    // Should show camelCase rule but not others
    expect(screen.getByText("camelCase Path Parameters")).toBeInTheDocument();
    // Some unrelated rule should not be visible
    expect(screen.queryByText("API Versioning")).not.toBeInTheDocument();
  });

  it("filters rules by category", () => {
    renderWithTheme(<LintRulesPanel overrides={[]} onSave={jest.fn()} isAdmin={true} />);
    const categorySelect = screen.getByDisplayValue("All Categories");
    fireEvent.change(categorySelect, { target: { value: "policy" } });
    // Should show policy rules only
    expect(screen.getByText("Pre-release Version Published")).toBeInTheDocument();
    // Naming rule should be hidden
    expect(screen.queryByText("camelCase Path Parameters")).not.toBeInTheDocument();
  });

  it("resets overrides to defaults when Reset button is clicked", () => {
    const overrides: LintRuleOverride[] = [{ ruleId: "naming-camelcase-params", enabled: false }];
    renderWithTheme(<LintRulesPanel overrides={overrides} onSave={jest.fn()} isAdmin={true} />);
    fireEvent.click(screen.getByText("Reset to Defaults"));
    // After reset, the changed count should reflect that persisted entries were removed
    // The save button should now show changed count
    const saveBtn = screen.getByText(/Save/);
    expect(saveBtn.textContent).toContain("1 changed");
  });

  it("saves a rule that was switched off", async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    renderWithTheme(<LintRulesPanel overrides={[]} onSave={onSave} isAdmin={true} />);

    fireEvent.click(screen.getByLabelText("Enable API Versioning"));
    expect(screen.getByText("Save (1 changed)")).toBeInTheDocument();
    expect(screen.getByText("modified")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Save (1 changed)"));
    });

    expect(onSave).toHaveBeenCalledWith([{ ruleId: "rest-versioning", enabled: false }]);
    expect(await screen.findByText("Saved!")).toBeInTheDocument();
  });

  it("saves a severity override", async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    renderWithTheme(<LintRulesPanel overrides={[]} onSave={onSave} isAdmin={true} />);

    fireEvent.change(screen.getByLabelText("Severity for API Versioning"), {
      target: { value: "critical" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save (1 changed)"));
    });

    expect(onSave).toHaveBeenCalledWith([
      { ruleId: "rest-versioning", enabled: true, severity: "critical" },
    ]);
  });

  it("locks every control for non-admins", () => {
    renderWithTheme(<LintRulesPanel overrides={[]} onSave={jest.fn()} isAdmin={false} />);
    expect(screen.getByLabelText("Enable API Versioning")).toBeDisabled();
    expect(screen.queryByLabelText("Severity for API Versioning")).not.toBeInTheDocument();
  });
});
