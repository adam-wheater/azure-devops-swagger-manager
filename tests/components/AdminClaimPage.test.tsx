import * as React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AdminClaimPage } from "@/components/AdminClaimPage";
import { ThemeProvider } from "@/utils/theme";

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("AdminClaimPage", () => {
  it("renders the claim button and current user name", () => {
    renderWithTheme(
      <AdminClaimPage currentUserName="Test User" onClaim={jest.fn()} error={null} />
    );
    expect(screen.getByText(/Test User/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Swagger Manager setup" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim Admin" })).toBeInTheDocument();
  });

  it("displays error when error prop is set", () => {
    renderWithTheme(
      <AdminClaimPage
        currentUserName="Test User"
        onClaim={jest.fn()}
        error="Something went wrong"
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("calls onClaim when button is clicked", async () => {
    const onClaim = jest.fn().mockResolvedValue(undefined);
    renderWithTheme(<AdminClaimPage currentUserName="Test User" onClaim={onClaim} error={null} />);

    await act(async () => {
      fireEvent.click(screen.getByText("Claim Admin"));
    });

    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it("shows 'Claiming...' and disables the button while the claim is in progress", async () => {
    let resolvePromise!: () => void;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    const onClaim = jest.fn().mockReturnValue(promise);

    renderWithTheme(<AdminClaimPage currentUserName="Test User" onClaim={onClaim} error={null} />);

    await act(async () => {
      fireEvent.click(screen.getByText("Claim Admin"));
    });

    expect(screen.getByText("Claiming...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claiming/ })).toBeDisabled();

    await act(async () => {
      resolvePromise();
    });
  });
});
