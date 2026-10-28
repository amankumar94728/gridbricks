import { describe, expect, it } from "vitest";
import { addDays, daysBetween, fmtDay, fmtGw, fmtGwh, fmtSignedGw, fmtTime, gwAxis } from "./format";

describe("number formatting", () => {
  it("formats MW values as GW", () => {
    expect(fmtGw(1995.6)).toBe("2.00 GW");
    expect(fmtGw(null)).toBe("–");
    expect(gwAxis(13500)).toBe("13.5 GW");
    expect(gwAxis(18000)).toBe("18 GW");
  });

  it("signs errors explicitly", () => {
    expect(fmtSignedGw(1728)).toBe("+1.73 GW");
    expect(fmtSignedGw(-500)).toBe("−0.50 GW");
    expect(fmtSignedGw(0)).toBe("0.00 GW");
  });

  it("formats energy in GWh", () => {
    expect(fmtGwh(280272)).toBe("280 GWh");
  });
});

describe("dates", () => {
  it("steps across month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(daysBetween("2026-01-30", "2026-02-01")).toEqual(["2026-01-30", "2026-01-31", "2026-02-01"]);
  });

  it("shows UK local time, including British Summer Time", () => {
    expect(fmtTime("2026-01-15T11:00:00Z")).toBe("11:00");
    expect(fmtTime("2026-07-15T10:00:00Z")).toBe("11:00");
    expect(fmtDay("2026-01-15")).toBe("Thu 15 Jan");
  });
});
