import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusPill, statusToneClasses } from "../StatusPill";

describe("statusToneClasses", () => {
  it("maps success statuses to the brand tone", () => {
    for (const s of ["extracted", "indexed", "completed"]) {
      expect(statusToneClasses(s)).toContain("text-brand-600");
      expect(statusToneClasses(s)).toContain("bg-brand-200");
    }
  });

  it("maps pending/attention statuses to the warning tone", () => {
    for (const s of ["pending", "attention_required", "completed_with_errors"]) {
      expect(statusToneClasses(s)).toContain("text-warning-600");
    }
  });

  it("maps failed to the destructive tone", () => {
    expect(statusToneClasses("failed")).toContain("text-destructive-600");
    expect(statusToneClasses("failed")).toContain("bg-destructive-200");
  });

  it("maps in-progress statuses to a pulsing neutral tone", () => {
    for (const s of ["extracting", "indexing", "enriching"]) {
      expect(statusToneClasses(s)).toContain("text-foreground-light");
      expect(statusToneClasses(s)).toContain("animate-pulse");
    }
  });

  it("maps cancelled/idle/unknown to the neutral tone (no pulse)", () => {
    for (const s of ["cancelled", "idle", "something_unknown"]) {
      expect(statusToneClasses(s)).toContain("text-foreground-light");
      expect(statusToneClasses(s)).not.toContain("animate-pulse");
    }
  });

  it("NEVER emits white-on-white classes for any known status", () => {
    const all = [
      "pending", "extracting", "extracted", "attention_required", "failed",
      "cancelled", "indexing", "indexed", "idle", "enriching", "completed",
      "completed_with_errors", "totally_unknown",
    ];
    for (const s of all) {
      const c = statusToneClasses(s);
      expect(c).not.toContain("text-white");
      expect(c).not.toMatch(/bg-white\//);
    }
  });
});

describe("StatusPill", () => {
  it("renders the status label", () => {
    render(<StatusPill status="extracting" />);
    expect(screen.getByText("extracting")).toBeInTheDocument();
  });

  it("renders a plain span when failed has no onFailedClick", () => {
    render(<StatusPill status="failed" />);
    expect(screen.getByText("failed").tagName).toBe("SPAN");
  });

  it("renders a clickable button when failed + onFailedClick provided", () => {
    const onClick = vi.fn();
    render(<StatusPill status="failed" onFailedClick={onClick} />);
    const btn = screen.getByRole("button", { name: /view error details/i });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does NOT render a button for non-failed statuses even with onFailedClick", () => {
    render(<StatusPill status="indexing" onFailedClick={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
