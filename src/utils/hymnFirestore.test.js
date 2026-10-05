import { describe, expect, it } from "vitest";
import {
  CANONICAL_HYMN_SCHEMA_VERSION,
  buildHymnWriteMetadata,
  decodeStoredHymn,
  encodeHymnForFirestore,
  migrateLegacyHymnData,
  normalizeCanonicalHymn,
} from "./hymnFirestore.js";
import {
  flattenedLegacyFixture,
  futureSchemaFixture,
  legacyMissingSchemaFixture,
  mixedChordFixture,
  multiChordWordFixture,
  simpleHymnFixture,
} from "./hymnFirestore.fixtures.js";

describe("canonical hymn model", () => {
  it("preserves an existing exclusive owner when a bootstrap Admin saves content", () => {
    expect(
      buildHymnWriteMetadata({
        currentUserUid: "ADMIN_UID_1",
        isBootstrapAdmin: true,
        existingHymn: {
          ownerUid: "original-owner",
          createdBy: "original-creator",
          updatedBy: "original-creator",
          isExclusive: true,
          exclusiveOwnerUid: "exclusive-owner",
        },
        requestedExclusive: true,
      }),
    ).toEqual({
      ownerUid: "original-owner",
      createdBy: "original-creator",
      updatedBy: "ADMIN_UID_1",
      isExclusive: true,
      exclusiveOwnerUid: "exclusive-owner",
    });
  });

  it("clears exclusive ownership when an Admin explicitly makes a hymn public", () => {
    expect(
      buildHymnWriteMetadata({
        currentUserUid: "ADMIN_UID_2",
        isBootstrapAdmin: true,
        existingHymn: {
          ownerUid: "original-owner",
          createdBy: "original-creator",
          isExclusive: true,
          exclusiveOwnerUid: "exclusive-owner",
        },
        requestedExclusive: false,
      }),
    ).toEqual({
      ownerUid: "original-owner",
      createdBy: "original-creator",
      updatedBy: "ADMIN_UID_2",
      isExclusive: false,
      exclusiveOwnerUid: "",
    });
  });

  it("does not let normal content savers change exclusive state or ownership", () => {
    expect(
      buildHymnWriteMetadata({
        currentUserUid: "content-saver",
        isBootstrapAdmin: false,
        existingHymn: {
          ownerUid: "original-owner",
          createdBy: "original-creator",
          isExclusive: true,
          exclusiveOwnerUid: "exclusive-owner",
        },
        requestedExclusive: false,
      }),
    ).toMatchObject({
      ownerUid: "original-owner",
      createdBy: "original-creator",
      updatedBy: "content-saver",
      isExclusive: true,
      exclusiveOwnerUid: "exclusive-owner",
    });
  });

  it("uses the authenticated UID for a newly created exclusive hymn", () => {
    expect(
      buildHymnWriteMetadata({
        currentUserUid: "ADMIN_UID_1",
        isBootstrapAdmin: true,
        existingHymn: null,
        requestedExclusive: true,
      }),
    ).toEqual({
      ownerUid: "ADMIN_UID_1",
      createdBy: "ADMIN_UID_1",
      updatedBy: "ADMIN_UID_1",
      isExclusive: true,
      exclusiveOwnerUid: "ADMIN_UID_1",
    });
  });

  it("normalizes the canonical internal representation", () => {
    const next = normalizeCanonicalHymn(simpleHymnFixture);
    const line = next.sections[0].lines[0];

    expect(next.schemaVersion).toBe(CANONICAL_HYMN_SCHEMA_VERSION);
    expect(line.wordChordGroups.length).toBeGreaterThan(0);
    expect(line.beforeWordChords[0]).toEqual(["D"]);
    expect(line.afterWordChords[0]).toEqual(["C"]);
    expect(line.wordChords[0]).toBe("G");
  });

  it("round-trips through encoded Firestore data without changing semantics", () => {
    const payload = encodeHymnForFirestore(simpleHymnFixture);
    const loaded = decodeStoredHymn(payload);

    expect(loaded.schemaVersion).toBe(CANONICAL_HYMN_SCHEMA_VERSION);
    expect(loaded.sections).toEqual(
      normalizeCanonicalHymn(simpleHymnFixture).sections,
    );
    expect(loaded.title).toBe("Simple hymn");
    expect(loaded.sections[0].lines[0].lyrics).toBe("يا سيدي أنت");
  });

  it("migrates a legacy hymn without schemaVersion into the current canonical model", () => {
    const migrated = decodeStoredHymn(legacyMissingSchemaFixture);
    const line = migrated.sections[0].lines[0];

    expect(migrated.schemaVersion).toBe(CANONICAL_HYMN_SCHEMA_VERSION);
    expect(line.wordChordGroups[0]).toEqual(["F"]);
    expect(line.beforeWordChords[0]).toEqual(["Bb"]);
    expect(line.afterWordChords[0]).toEqual(["G"]);
  });

  it("migrates legacy flattened chord data conservatively", () => {
    const migrated = migrateLegacyHymnData(flattenedLegacyFixture);
    const line = migrated.sections[0].lines[0];

    expect(migrated.schemaVersion).toBe(CANONICAL_HYMN_SCHEMA_VERSION);
    expect(line.wordChordGroups.flat()).toEqual(
      expect.arrayContaining(["E", "A"]),
    );
    expect(line.beforeWordChords.flat()).not.toContain("D");
    expect(line.afterWordChords.flat()).toContain("C");
    expect(line.gapChords.flat()).toContain("C");
  });

  it("preserves multiple chords on the same word and same letter", () => {
    const normalized = normalizeCanonicalHymn(multiChordWordFixture);
    const line = normalized.sections[0].lines[0];

    expect(line.wordChordGroups[0]).toEqual(expect.arrayContaining(["C", "G"]));
    expect(line.wordLetterChords[0][0]).toEqual(["C"]);
    expect(line.wordLetterChords[0][1]).toEqual(["G"]);
  });

  it("handles before, after, and gap chord slots without inventing values", () => {
    const normalized = normalizeCanonicalHymn(mixedChordFixture);
    const line = normalized.sections[0].lines[0];

    expect(line.beforeWordChords.flat()).toEqual(
      expect.arrayContaining(["F", "E", "D", "G"]),
    );
    expect(line.afterWordChords.flat()).toEqual(
      expect.arrayContaining(["C", "D", "A", "G"]),
    );
    expect(line.gapChords.flat().length).toBeGreaterThan(0);
  });

  it("keeps Arabic text intact across canonicalization and saving", () => {
    const encoded = encodeHymnForFirestore(simpleHymnFixture);
    const decoded = decodeStoredHymn(encoded);

    expect(decoded.sections[0].lines[0].lyrics).toBe("يا سيدي أنت");
  });

  it("is idempotent for legacy migration", () => {
    const once = migrateLegacyHymnData(legacyMissingSchemaFixture);
    const twice = migrateLegacyHymnData(once);

    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it("rejects future schema versions without mutating the data", () => {
    expect(() => decodeStoredHymn(futureSchemaFixture)).toThrow(
      /newer Harmony Notes schema/i,
    );
  });

  it("accepts sparse missing optional properties and keeps the structure safe", () => {
    const sparse = {
      id: "sparse",
      title: "Sparse",
      key: "G",
      sections: [
        {
          lines: [
            {
              lyrics: "لا شيء",
            },
          ],
        },
      ],
    };

    const normalized = decodeStoredHymn(sparse);
    expect(normalized.sections[0].lines[0].lyrics).toBe("لا شيء");
    expect(Array.isArray(normalized.sections[0].lines[0].wordChords)).toBe(
      true,
    );
  });
});
