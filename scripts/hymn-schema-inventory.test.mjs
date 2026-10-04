import { describe, expect, it } from "vitest";
import {
  buildHymnSchemaInventory,
  formatHymnSchemaInventory,
} from "./hymn-schema-inventory-core.mjs";

class TestTimestamp {}

const classify = (documents) =>
  buildHymnSchemaInventory(documents, {
    generatedAt: "2026-10-04T00:00:00.000Z",
    isTimestamp: (value) => value instanceof TestTimestamp,
  });

describe("hymn schema inventory classification", () => {
  it("classifies missing isExclusive as legacy without mutating the document", () => {
    const legacy = { title: "Old hymn" };
    const report = classify([{ id: "legacy-1", data: legacy }]);

    expect(report.isExclusive.missing).toBe(1);
    expect(report.problemDocumentIds.missingIsExclusive).toEqual(["legacy-1"]);
    expect(legacy).not.toHaveProperty("isExclusive");
  });

  it("classifies explicit public and exclusive documents and their owners", () => {
    const report = classify([
      { id: "public", data: { isExclusive: false } },
      { id: "owned", data: { isExclusive: true, exclusiveOwnerUid: "user-A" } },
      { id: "owner-missing", data: { isExclusive: true } },
      {
        id: "owner-invalid",
        data: { isExclusive: true, exclusiveOwnerUid: "" },
      },
    ]);

    expect(report.isExclusive.false).toBe(1);
    expect(report.isExclusive.true).toBe(3);
    expect(report.exclusiveOwnerUid).toEqual({
      valid: 1,
      missing: 1,
      invalid: 1,
    });
    expect(report.problemDocumentIds.exclusiveMissingOwner).toEqual([
      "owner-missing",
    ]);
    expect(report.problemDocumentIds.exclusiveInvalidOwner).toEqual([
      "owner-invalid",
    ]);
  });

  it.each([null, "false", 0, 1, {}])(
    "classifies invalid isExclusive value %j",
    (value) => {
      expect(
        classify([{ id: "invalid", data: { isExclusive: value } }]).isExclusive
          .invalid,
      ).toBe(1);
    },
  );

  it("distinguishes Timestamp, missing, and wrong-type createdAt", () => {
    const report = classify([
      { id: "timestamp", data: { createdAt: new TestTimestamp() } },
      { id: "missing", data: {} },
      { id: "wrong-type", data: { createdAt: "2026-01-01" } },
    ]);

    expect(report.createdAt).toEqual({ valid: 1, missing: 1, invalid: 1 });
    expect(report.problemDocumentIds.missingCreatedAt).toEqual(["missing"]);
    expect(report.problemDocumentIds.invalidCreatedAt).toEqual(["wrong-type"]);
  });

  it("classifies schemaVersion presence, missing values, invalid types, and future versions", () => {
    const report = classify([
      { id: "current", data: { schemaVersion: 2 } },
      { id: "missing", data: {} },
      { id: "wrong-type", data: { schemaVersion: "2" } },
      { id: "future", data: { schemaVersion: 3 } },
    ]);

    expect(report.schemaVersion).toEqual({
      valid: 2,
      missing: 1,
      invalid: 1,
      unsupported: 1,
    });
    expect(report.problemDocumentIds.unsupportedSchemaVersion).toEqual([
      "future",
    ]);
  });

  it("records title and key field shape without including their values in output", () => {
    const report = classify([
      { id: "has-fields", data: { title: "Private title", key: "G" } },
      { id: "missing-fields", data: {} },
    ]);
    const text = formatHymnSchemaInventory(report);

    expect(report.title).toEqual({ present: 1, missing: 1, invalid: 0 });
    expect(report.key).toEqual({ present: 1, missing: 1, invalid: 0 });
    expect(text).not.toContain("Private title");
    expect(text).not.toContain("lyrics");
    expect(text).not.toContain("chords");
  });
});
