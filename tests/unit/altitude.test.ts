import { describe, expect, it } from "vitest";
import { computeAltitude } from "../../lib/altitude";

describe("computeAltitude", () => {
  it("sums weights of done tasks", () => {
    expect(
      computeAltitude(
        [
          { status: "done", weight: 60 },
          { status: "done", weight: 40 },
          { status: "pending", weight: 100 },
        ],
        [],
      ),
    ).toBe(100);
  });

  it("subtracts blip amounts", () => {
    expect(computeAltitude([{ status: "done", weight: 60 }], [{ amount: 15 }, { amount: 15 }])).toBe(30);
  });

  it("floors at zero rather than going negative", () => {
    expect(computeAltitude([{ status: "pending", weight: 60 }], [{ amount: 15 }])).toBe(0);
  });

  it("returns zero for no tasks or blips", () => {
    expect(computeAltitude([], [])).toBe(0);
  });
});
