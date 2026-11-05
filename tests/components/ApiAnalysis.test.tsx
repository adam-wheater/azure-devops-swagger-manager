import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ApiAnalysis } from "@/components/ApiAnalysis";
import { makeScanResult, paymentsApi, usersApi } from "./fixtures";

function Harness({ results }: { results: Map<string, ReturnType<typeof makeScanResult>> }) {
  const [selected, setSelected] = React.useState<string | null>(null);
  return (
    <ApiAnalysis
      apis={[usersApi, paymentsApi]}
      scanResults={results}
      selectedApiId={selected}
      onSelectApi={setSelected}
    />
  );
}

const scanned = () => new Map([[usersApi.id, makeScanResult()]]);

describe("ApiAnalysis", () => {
  it("asks for a scan first when there are no results", () => {
    render(<Harness results={new Map()} />);
    expect(screen.getByText("No scan results yet.")).toBeInTheDocument();
  });

  it("asks the user to pick an API", () => {
    render(<Harness results={scanned()} />);
    expect(screen.getByText("Select an API")).toBeInTheDocument();
  });

  it("lists issue counts in the API selector", () => {
    render(<Harness results={scanned()} />);
    expect(screen.getByRole("option", { name: "Users API (3 issues)" })).toBeInTheDocument();
  });

  it("groups findings by path, worst severity first, and expands a group", () => {
    render(<Harness results={scanned()} />);
    fireEvent.change(screen.getByLabelText("API"), { target: { value: usersApi.id } });

    expect(screen.getByText("Users Service")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 issues")).toBeInTheDocument();

    const groups = screen.getAllByRole("button", { expanded: false });
    expect(groups[0]).toHaveTextContent("(global)");
    expect(screen.queryByText("Use GET /users instead.", { exact: false })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\/users\/getAll/ }));
    expect(screen.getByText(/Suggestion: Use GET \/users instead\./)).toBeInTheDocument();
    expect(screen.getByText('Path segment "getAll" contains a verb.')).toBeInTheDocument();
  });

  it("filters by severity, category and search text", () => {
    render(<Harness results={scanned()} />);
    fireEvent.change(screen.getByLabelText("API"), { target: { value: usersApi.id } });

    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "high" } });
    expect(screen.getByText("1 of 3 issues")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "all" } });

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "documentation" } });
    expect(screen.getByText("1 of 3 issues")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\/users\/\{id\}/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "all" } });

    fireEvent.change(screen.getByLabelText("Search findings"), { target: { value: "delete" } });
    expect(screen.getByText("1 of 3 issues")).toBeInTheDocument();
  });

  it("explains when filters hide every finding", () => {
    render(<Harness results={scanned()} />);
    fireEvent.change(screen.getByLabelText("API"), { target: { value: usersApi.id } });
    fireEvent.change(screen.getByLabelText("Search findings"), { target: { value: "zzz" } });
    expect(screen.getByText("No issues match your current filters.")).toBeInTheDocument();
  });

  it("celebrates a clean API", () => {
    render(<Harness results={new Map([[usersApi.id, makeScanResult(usersApi, [])]])} />);
    fireEvent.change(screen.getByLabelText("API"), { target: { value: usersApi.id } });
    expect(screen.getByText("No issues found! This API looks clean.")).toBeInTheDocument();
  });
});
