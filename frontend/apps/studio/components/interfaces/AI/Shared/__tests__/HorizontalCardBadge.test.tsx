import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HorizontalCardBadge } from "../HorizontalCardBadge";

describe("HorizontalCardBadge", () => {
  it("renders label and value", () => {
    render(<HorizontalCardBadge label="Strategy" value="supervisor" />);
    expect(screen.getByText("Strategy:")).toBeInTheDocument();
    expect(screen.getByText("supervisor")).toBeInTheDocument();
  });

  it("uses default tone when none specified", () => {
    const { container } = render(<HorizontalCardBadge label="X" value="y" />);
    expect(container.firstChild).toHaveAttribute("data-tone", "default");
  });

  it("applies the requested tone via data-tone attr", () => {
    const { container } = render(<HorizontalCardBadge label="X" value="y" tone="danger" />);
    expect(container.firstChild).toHaveAttribute("data-tone", "danger");
  });

  it("renders an icon when provided", () => {
    render(<HorizontalCardBadge label="X" value="y" icon={<span data-testid="icon" />} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("uses -600 text shades (not -400) for adequate light-mode contrast", () => {
    for (const tone of ["success", "warning", "danger", "info"] as const) {
      const { container } = render(<HorizontalCardBadge label="X" value="y" tone={tone} />);
      const cls = (container.firstChild as HTMLElement).className;
      expect(cls).not.toMatch(/text-(emerald|amber|red|blue)-400/);
      // and a theme-aware text token IS present (catches accidental removal)
      expect(cls).toMatch(/text-(brand|warning|destructive|foreground)-/);
    }
  });
});
