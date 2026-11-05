import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ApiDetailPage } from "@/components/ApiDetailPage";
import { makeScanResult, usersApi } from "./fixtures";

jest.mock("@/components/CreateBugDialog", () => ({
  CreateBugDialog: ({ finding, onCreated, onClose }: any) => (
    <div role="dialog" aria-label="Create bug">
      <span>dialog for {finding.ruleId}</span>
      <button
        onClick={() =>
          onCreated({ id: 77, url: "https://dev.azure.com/contoso/p/_workitems/edit/77" })
        }
      >
        finish
      </button>
      <button onClick={onClose}>dismiss</button>
    </div>
  ),
}));

type Props = React.ComponentProps<typeof ApiDetailPage>;

function renderDetail(overrides: Partial<Props> = {}) {
  const props: Props = {
    result: makeScanResult(),
    onBack: jest.fn(),
    isAdmin: true,
    bugMappings: new Map(),
    onBugCreated: jest.fn(),
    ...overrides,
  };
  render(<ApiDetailPage {...props} />);
  return props;
}

describe("ApiDetailPage", () => {
  it("shows the spec header", () => {
    renderDetail();
    expect(screen.getByRole("heading", { name: "Users Service" })).toBeInTheDocument();
    expect(screen.getByText("Manages user accounts.")).toBeInTheDocument();
    expect(screen.getByText("v1.2.0")).toBeInTheDocument();
    expect(screen.getByText("OpenAPI 3.0.1")).toBeInTheDocument();
    expect(screen.getByText("public")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText(/2 endpoints/)).toBeInTheDocument();
    expect(screen.getByText(/1 schemas/)).toBeInTheDocument();
  });

  it("goes back to the dashboard", () => {
    const props = renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Back to Dashboard" }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("toggles the raw spec viewer", () => {
    renderDetail();
    expect(screen.queryByText(/"openapi": "3.0.1"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View Raw Spec" }));
    expect(screen.getByText(/"openapi": "3.0.1"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide Raw Spec" }));
    expect(screen.queryByText(/"openapi": "3.0.1"/)).not.toBeInTheDocument();
  });

  it("summarises issues by severity", () => {
    renderDetail();
    expect(screen.getByText("Total Issues")).toBeInTheDocument();
    expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
    expect(screen.getByText("Naming: 1")).toBeInTheDocument();
    expect(screen.getByText("Documentation: 1")).toBeInTheDocument();
    expect(screen.getByText("Policy: 1")).toBeInTheDocument();
  });

  it("shows a clean banner when there are no findings", () => {
    renderDetail({ result: makeScanResult(usersApi, []) });
    expect(screen.getByText("No issues found - this API is clean!")).toBeInTheDocument();
  });

  it("lists global issues separately", () => {
    renderDetail();
    expect(screen.getByText("Global Issues")).toBeInTheDocument();
    expect(screen.getByText("The API has no description.")).toBeInTheDocument();
  });

  it("expands an endpoint to show parameters, responses and its issues", () => {
    renderDetail();
    expect(screen.queryByText("Page number", { exact: false })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /GET \/users\/getAll/ }));

    expect(screen.getByText("getAllUsers")).toBeInTheDocument();
    expect(screen.getByText("page")).toBeInTheDocument();
    expect(screen.getByText("required")).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.getByText('Path segment "getAll" contains a verb.')).toBeInTheDocument();
  });

  it("opens the bug dialog for an admin and reports the created bug under the finding key", () => {
    const props = renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /GET \/users\/getAll/ }));
    // The global finding's button comes first in the page; the endpoint's is second.
    fireEvent.click(screen.getAllByRole("button", { name: "Create Bug" })[1]);
    expect(screen.getByText("dialog for naming-no-verbs-in-paths")).toBeInTheDocument();

    fireEvent.click(screen.getByText("finish"));
    expect(props.onBugCreated).toHaveBeenCalledWith(
      "naming-no-verbs-in-paths::/users/getAll::GET",
      {
        id: 77,
        url: "https://dev.azure.com/contoso/p/_workitems/edit/77",
      }
    );
    expect(screen.queryByText("finish")).not.toBeInTheDocument();
  });

  it("links an existing bug instead of offering Create Bug", () => {
    renderDetail({
      bugMappings: new Map([
        [
          "naming-no-verbs-in-paths::/users/getAll::GET",
          { id: 55, url: "https://dev.azure.com/contoso/p/_workitems/edit/55" },
        ],
      ]),
    });
    fireEvent.click(screen.getByRole("button", { name: /GET \/users\/getAll/ }));
    const link = screen.getByRole("link", { name: /Bug #55/ });
    expect(link).toHaveAttribute("href", "https://dev.azure.com/contoso/p/_workitems/edit/55");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("hides Create Bug from non-admins", () => {
    renderDetail({ isAdmin: false });
    fireEvent.click(screen.getByRole("button", { name: /GET \/users\/getAll/ }));
    expect(screen.queryByRole("button", { name: "Create Bug" })).not.toBeInTheDocument();
  });
});
