/**
 * Card — tests for the Phase 3 Liquid Glass surface primitive (Task 3).
 *
 * Covers: render, data-slot contract, size prop, className forwarding,
 * and the sub-slots (Header, Title, Description, Content, Footer, Action).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

describe("Card", () => {
  it("renders children inside a card surface", () => {
    render(<Card>hello</Card>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it('exposes data-slot="card"', () => {
    const { container } = render(<Card>x</Card>);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-slot")).toBe("card");
  });

  it('defaults to size="default" and applies size token', () => {
    const { container } = render(<Card>x</Card>);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-size")).toBe("default");
  });

  it('honors size="sm"', () => {
    const { container } = render(<Card size="sm">x</Card>);
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute("data-size")).toBe("sm");
  });

  it("applies the new token surface classes (bg-surface, border-border, rounded-lg)", () => {
    const { container } = render(<Card>x</Card>);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("bg-surface");
    expect(root.className).toContain("border-border");
    expect(root.className).toContain("rounded-lg");
  });

  it("forwards className to the root", () => {
    const { container } = render(<Card className="my-card">x</Card>);
    expect(container.firstChild).toHaveClass("my-card");
  });

  it('renders CardHeader with data-slot="card-header"', () => {
    render(
      <Card>
        <CardHeader data-testid="h">
          <CardTitle>Title</CardTitle>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByTestId("h").getAttribute("data-slot")).toBe("card-header");
  });

  it("renders CardTitle / CardDescription / CardContent / CardFooter / CardAction with their data-slot hooks", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle data-testid="t">T</CardTitle>
          <CardDescription data-testid="d">D</CardDescription>
          <CardAction data-testid="a">A</CardAction>
        </CardHeader>
        <CardContent data-testid="c">C</CardContent>
        <CardFooter data-testid="f">F</CardFooter>
      </Card>,
    );
    expect(screen.getByTestId("t").getAttribute("data-slot")).toBe("card-title");
    expect(screen.getByTestId("d").getAttribute("data-slot")).toBe("card-description");
    expect(screen.getByTestId("a").getAttribute("data-slot")).toBe("card-action");
    expect(screen.getByTestId("c").getAttribute("data-slot")).toBe("card-content");
    expect(screen.getByTestId("f").getAttribute("data-slot")).toBe("card-footer");
  });
});
