import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Render Trigger inline and always show the Popup content so we can assert
// against rows without animations.
vi.mock("@base-ui/react/popover", () => {
  const React = require("react");
  return {
    Popover: {
      Root: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Trigger: ({
        children,
        render: renderProp,
        ...rest
      }: {
        children?: React.ReactNode;
        render?: React.ReactElement;
        [key: string]: unknown;
      }) => {
        if (renderProp) {
          return React.cloneElement(renderProp, rest, children);
        }
        return React.createElement("button", rest, children);
      },
      Portal: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Positioner: ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      Popup: ({ children, className }: { children: React.ReactNode; className?: string }) =>
        React.createElement("div", { "data-testid": "popover-content", className }, children),
    },
  };
});

vi.mock("@base-ui/react/use-render", () => ({
  useRender: ({
    props,
    defaultTagName,
  }: {
    props: Record<string, unknown>;
    defaultTagName: string;
  }) => {
    const React = require("react");
    return React.createElement(defaultTagName, props);
  },
}));

vi.mock("@base-ui/react/merge-props", () => ({
  mergeProps: (...args: Record<string, unknown>[]) => Object.assign({}, ...args),
}));

import { AttributionPill } from "@/components/AttributionPill";

const FIXTURE_ONE = [
  {
    extraction_id: 42,
    filename: "alpha.cdx",
    created_at: "2026-04-01T10:00:00+00:00",
  },
];

const FIXTURE_MANY = [
  { extraction_id: 11, filename: "alpha.cdx", created_at: "2026-04-01T10:00:00+00:00" },
  { extraction_id: 12, filename: "beta.cdx", created_at: "2026-04-02T10:00:00+00:00" },
  { extraction_id: 13, filename: "gamma.cdx", created_at: "2026-04-03T10:00:00+00:00" },
];

describe("AttributionPill", () => {
  it("renders nothing when count is 0", () => {
    const { container } = render(<AttributionPill count={0} extractions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("count === 1 renders a direct-action button (not a popover)", () => {
    const onView = vi.fn();
    render(<AttributionPill count={1} extractions={FIXTURE_ONE} onView={onView} />);

    const btn = screen.getByRole("button", { name: /Found in alpha\.cdx/i });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-haspopup")).toBeNull();
    fireEvent.click(btn);
    expect(onView).toHaveBeenCalledWith(42);
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("count > 1 renders a popover trigger and rows fire onView per extraction", () => {
    const onView = vi.fn();
    render(<AttributionPill count={3} extractions={FIXTURE_MANY} onView={onView} />);

    const trigger = screen.getByRole("button", { name: /Found in 3 extractions/i });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");

    // Each extraction renders as a clickable row inside the (mocked) popover.
    const rowAlpha = screen.getByRole("button", { name: /alpha\.cdx/ });
    const rowBeta = screen.getByRole("button", { name: /beta\.cdx/ });
    const rowGamma = screen.getByRole("button", { name: /gamma\.cdx/ });

    fireEvent.click(rowBeta);
    expect(onView).toHaveBeenCalledWith(12);
    fireEvent.click(rowGamma);
    expect(onView).toHaveBeenCalledWith(13);
    fireEvent.click(rowAlpha);
    expect(onView).toHaveBeenCalledWith(11);
    expect(onView).toHaveBeenCalledTimes(3);
  });

  it("count === 1 with non-positive extraction_id falls back to popover (SEC MED-05)", () => {
    const onView = vi.fn();
    render(
      <AttributionPill
        count={1}
        extractions={[
          { extraction_id: -1, filename: "spoof.cdx", created_at: "2026-04-01T10:00:00+00:00" },
        ]}
        onView={onView}
      />,
    );
    // Direct button must NOT exist for invalid id; popover trigger does.
    expect(screen.queryByRole("button", { name: /Found in spoof\.cdx/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Found in 1 extractions/i })).toBeTruthy();
  });

  it("popover row with non-positive extraction_id renders as plain text (SEC MED-05)", () => {
    const onView = vi.fn();
    render(
      <AttributionPill
        count={2}
        extractions={[
          { extraction_id: 11, filename: "alpha.cdx", created_at: "2026-04-01T10:00:00+00:00" },
          { extraction_id: 0, filename: "spoof.cdx", created_at: "2026-04-02T10:00:00+00:00" },
        ]}
        onView={onView}
      />,
    );
    // Valid row is a button.
    expect(screen.getByRole("button", { name: /alpha\.cdx/ })).toBeTruthy();
    // Spoof row is rendered as plain text (no clickable button) — clicking it
    // can't fire onView.
    expect(screen.queryByRole("button", { name: /spoof\.cdx/ })).toBeNull();
    expect(screen.getByText("spoof.cdx")).toBeTruthy();
  });
});
