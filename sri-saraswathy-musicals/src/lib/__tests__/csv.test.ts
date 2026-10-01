import { describe, expect, it } from "vitest";
import { csvEscape, neutraliseFormula, toCsv } from "@/lib/gst/summary";

describe("CSV formula neutralising", () => {
  it("prefixes cells a spreadsheet would run as formulas", () => {
    expect(neutraliseFormula("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(neutraliseFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutraliseFormula("+cmd")).toBe("'+cmd");
    expect(neutraliseFormula("-cmd")).toBe("'-cmd");
  });

  it("leaves ordinary text and real numbers alone", () => {
    expect(neutraliseFormula("Violin")).toBe("Violin");
    expect(neutraliseFormula(-250)).toBe(-250);
    expect(neutraliseFormula("-250.50")).toBe("-250.50");
    expect(neutraliseFormula("+91 98765 43210")).toBe("+91 98765 43210");
  });

  it("still quotes commas and quotes after neutralising", () => {
    expect(csvEscape("=A,B")).toBe(`"'=A,B"`);
    expect(toCsv([["a", "=x"], [1, 2]])).toBe("a,'=x\r\n1,2");
  });
});
