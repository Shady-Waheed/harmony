import { describe, expect, it, vi } from "vitest";
import {
  createOutputViewOptions,
  normalizeOutputFontSize,
  requestBrowserPrint,
} from "./outputMode.js";

describe("output presentation settings", () => {
  it("clamps the output font size to its supported range", () => {
    expect(normalizeOutputFontSize(8)).toBe(18);
    expect(normalizeOutputFontSize(40)).toBe(40);
    expect(normalizeOutputFontSize(120)).toBe(72);
    expect(normalizeOutputFontSize("invalid")).toBe(36);
  });

  it("creates isolated options without changing hymn data or settings", () => {
    const hymn = {
      id: "hymn-1",
      key: "G",
      sections: [{ lines: [{ lyrics: "يا سيدي", wordChords: ["G/B"] }] }],
    };
    const settings = {
      profile: "projection",
      fontSize: 48,
      showChords: false,
      showKey: true,
    };
    const originalHymn = JSON.stringify(hymn);
    const originalSettings = { ...settings };

    expect(createOutputViewOptions(settings)).toEqual({
      profile: "projection",
      fontSize: 48,
      showChords: false,
      showKey: true,
    });
    expect(hymn).toEqual(JSON.parse(originalHymn));
    expect(settings).toEqual(originalSettings);
  });

  it("requests native browser printing and handles missing or throwing APIs", () => {
    const print = vi.fn();
    expect(requestBrowserPrint({ print })).toBe(true);
    expect(print).toHaveBeenCalledOnce();
    expect(requestBrowserPrint({})).toBe(false);
    expect(
      requestBrowserPrint({
        print: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(false);
  });
});
