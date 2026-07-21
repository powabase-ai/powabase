import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HorizontalCard } from "../HorizontalCard";

describe("HorizontalCard", () => {
  it("renders name and description", () => {
    render(
      <HorizontalCard
        href="/x"
        icon={<span data-testid="icon" />}
        name="My Item"
        description="Some description"
      />
    );
    expect(screen.getByText("My Item")).toBeInTheDocument();
    expect(screen.getByText("Some description")).toBeInTheDocument();
  });

  it("wraps content in a link with the given href", () => {
    render(<HorizontalCard href="/foo/bar" icon={<span />} name="X" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/foo/bar");
  });

  it("renders provided badges", () => {
    render(
      <HorizontalCard
        href="/x"
        icon={<span />}
        name="X"
        badges={[
          { label: "strategy", value: "supervisor" },
          { label: "agents", value: 3 },
        ]}
      />
    );
    expect(screen.getByText("supervisor")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders rightMeta slot", () => {
    render(
      <HorizontalCard
        href="/x"
        icon={<span />}
        name="X"
        rightMeta={<span data-testid="rm">Created 1d ago</span>}
      />
    );
    expect(screen.getByTestId("rm")).toBeInTheDocument();
  });

  it("renders actions slot outside the link (no nested interactive elements)", () => {
    render(
      <HorizontalCard
        href="/x"
        icon={<span />}
        name="X"
        actions={<button data-testid="del">Delete</button>}
      />
    );
    const link = screen.getByRole("link");
    const actionButton = screen.getByTestId("del");
    expect(actionButton).toBeInTheDocument();
    // The action button must NOT be a descendant of the <a>. Nesting an
    // interactive element inside a link is invalid HTML5 and triggers React
    // hydration warnings; the component renders the link as a card-sized
    // overlay with actions as a sibling above it.
    expect(link.contains(actionButton)).toBe(false);
  });

  it("renders no description placeholder when null", () => {
    const { container } = render(
      <HorizontalCard href="/x" icon={<span />} name="X" description={null} />
    );
    expect(container.textContent).toContain("X");
  });
});
