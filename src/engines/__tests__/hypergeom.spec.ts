import { describe, it, expect } from "vitest";
import { hypergeomAtLeast, hypergeomAtLeastOne, estimateCastProbability } from "../hypergeom";

describe("hypergeomAtLeastOne", () => {
  it("returns 0 when no sources", () => {
    expect(hypergeomAtLeastOne(99, 0, 8)).toBe(0);
  });

  it("returns 1 when all cards are sources", () => {
    expect(hypergeomAtLeastOne(99, 99, 8)).toBe(1);
  });

  it("60-card T1: 14 sources → ~90% for single pip (matches Karsten 2022)", () => {
    // Karsten's 60-card threshold: 14 sources in 60 cards, n=8 draws → ~90%
    const p = hypergeomAtLeastOne(60, 14, 8);
    expect(p).toBeGreaterThanOrEqual(0.89);
    expect(p).toBeLessThanOrEqual(0.93);
  });

  it("increases monotonically with more sources", () => {
    let prev = 0;
    for (let k = 0; k <= 30; k++) {
      const p = hypergeomAtLeastOne(99, k, 9);
      expect(p).toBeGreaterThanOrEqual(prev - 0.001);
      prev = p;
    }
  });
});

describe("hypergeomAtLeast", () => {
  it("handles minK=0 (always 1)", () => {
    expect(hypergeomAtLeast(99, 10, 8, 0)).toBe(1);
  });

  it("matches hypergeomAtLeastOne for k=1", () => {
    const p1 = hypergeomAtLeast(99, 20, 9, 1);
    const p2 = hypergeomAtLeastOne(99, 20, 9);
    expect(Math.abs(p1 - p2)).toBeLessThan(1e-6);
  });

  it("returns 0 when required pips exceed possible draws", () => {
    expect(hypergeomAtLeast(99, 5, 3, 6)).toBe(0);
  });
});

describe("estimateCastProbability", () => {
  it("Commander T1: ~19 sources for 90% single pip", () => {
    // Per Karsten 2022 Commander table
    const p = estimateCastProbability(99, 19, 1, 1);
    expect(p).toBeGreaterThanOrEqual(0.85); // within 5% of 90%
    expect(p).toBeLessThanOrEqual(0.95);
  });

  it("returns 0 with no sources", () => {
    expect(estimateCastProbability(99, 0, 3, 2)).toBe(0);
  });

  it("increases with more sources", () => {
    const p10 = estimateCastProbability(99, 10, 3, 1);
    const p20 = estimateCastProbability(99, 20, 3, 1);
    const p30 = estimateCastProbability(99, 30, 3, 1);
    expect(p20).toBeGreaterThan(p10);
    expect(p30).toBeGreaterThan(p20);
  });

  it("decreases with more pips required", () => {
    const p1 = estimateCastProbability(99, 20, 4, 1);
    const p2 = estimateCastProbability(99, 20, 4, 2);
    const p3 = estimateCastProbability(99, 20, 4, 3);
    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p3);
  });
});
