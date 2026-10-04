const CURRENT_SCHEMA_VERSION = 2;

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function createFieldCounts() {
  return { present: 0, missing: 0, invalid: 0 };
}

function appendId(groups, group, id) {
  groups[group].push(String(id));
}

function classifyStringField(data, field, counts) {
  if (!hasOwn(data, field)) {
    counts.missing += 1;
  } else if (typeof data[field] === "string") {
    counts.present += 1;
  } else {
    counts.invalid += 1;
  }
}

export function buildHymnSchemaInventory(
  documents,
  { isTimestamp = () => false, generatedAt = new Date().toISOString() } = {},
) {
  const inventory = {
    generatedAt,
    collection: "hymns",
    total: 0,
    isExclusive: { false: 0, true: 0, missing: 0, invalid: 0 },
    exclusiveOwnerUid: { valid: 0, missing: 0, invalid: 0 },
    createdAt: { valid: 0, missing: 0, invalid: 0 },
    schemaVersion: { valid: 0, missing: 0, invalid: 0, unsupported: 0 },
    title: createFieldCounts(),
    key: createFieldCounts(),
    problemDocumentIds: {
      missingIsExclusive: [],
      invalidIsExclusive: [],
      exclusiveMissingOwner: [],
      exclusiveInvalidOwner: [],
      missingCreatedAt: [],
      invalidCreatedAt: [],
      missingSchemaVersion: [],
      invalidSchemaVersion: [],
      unsupportedSchemaVersion: [],
      missingTitle: [],
      invalidTitle: [],
      missingKey: [],
      invalidKey: [],
    },
  };

  for (const document of Array.isArray(documents) ? documents : []) {
    const id = String(document?.id ?? "");
    const data =
      document?.data && typeof document.data === "object" ? document.data : {};
    inventory.total += 1;

    if (!hasOwn(data, "isExclusive")) {
      inventory.isExclusive.missing += 1;
      appendId(inventory.problemDocumentIds, "missingIsExclusive", id);
    } else if (data.isExclusive === false) {
      inventory.isExclusive.false += 1;
    } else if (data.isExclusive === true) {
      inventory.isExclusive.true += 1;
      if (!hasOwn(data, "exclusiveOwnerUid")) {
        inventory.exclusiveOwnerUid.missing += 1;
        appendId(inventory.problemDocumentIds, "exclusiveMissingOwner", id);
      } else if (
        typeof data.exclusiveOwnerUid === "string" &&
        data.exclusiveOwnerUid.trim().length > 0
      ) {
        inventory.exclusiveOwnerUid.valid += 1;
      } else {
        inventory.exclusiveOwnerUid.invalid += 1;
        appendId(inventory.problemDocumentIds, "exclusiveInvalidOwner", id);
      }
    } else {
      inventory.isExclusive.invalid += 1;
      appendId(inventory.problemDocumentIds, "invalidIsExclusive", id);
    }

    if (!hasOwn(data, "createdAt")) {
      inventory.createdAt.missing += 1;
      appendId(inventory.problemDocumentIds, "missingCreatedAt", id);
    } else if (isTimestamp(data.createdAt)) {
      inventory.createdAt.valid += 1;
    } else {
      inventory.createdAt.invalid += 1;
      appendId(inventory.problemDocumentIds, "invalidCreatedAt", id);
    }

    if (!hasOwn(data, "schemaVersion")) {
      inventory.schemaVersion.missing += 1;
      appendId(inventory.problemDocumentIds, "missingSchemaVersion", id);
    } else if (
      typeof data.schemaVersion === "number" &&
      Number.isInteger(data.schemaVersion) &&
      data.schemaVersion >= 0
    ) {
      inventory.schemaVersion.valid += 1;
      if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
        inventory.schemaVersion.unsupported += 1;
        appendId(inventory.problemDocumentIds, "unsupportedSchemaVersion", id);
      }
    } else {
      inventory.schemaVersion.invalid += 1;
      appendId(inventory.problemDocumentIds, "invalidSchemaVersion", id);
    }

    classifyStringField(data, "title", inventory.title);
    if (!hasOwn(data, "title")) {
      appendId(inventory.problemDocumentIds, "missingTitle", id);
    } else if (typeof data.title !== "string") {
      appendId(inventory.problemDocumentIds, "invalidTitle", id);
    }

    classifyStringField(data, "key", inventory.key);
    if (!hasOwn(data, "key")) {
      appendId(inventory.problemDocumentIds, "missingKey", id);
    } else if (typeof data.key !== "string") {
      appendId(inventory.problemDocumentIds, "invalidKey", id);
    }
  }

  return inventory;
}

function formatIds(title, ids, limit) {
  const shownIds = ids.slice(0, limit);
  const lines = [`${title}: ${ids.length}`];
  if (shownIds.length) {
    lines.push(...shownIds.map((id) => `- ${id}`));
  }
  if (ids.length > shownIds.length) {
    lines.push(
      `... ${ids.length - shownIds.length} more IDs are in the JSON report`,
    );
  }
  return lines;
}

export function formatHymnSchemaInventory(inventory, { idLimit = 50 } = {}) {
  const lines = [
    "Harmony Notes — Read-only Hymn Schema Inventory",
    `Generated: ${inventory.generatedAt}`,
    `Collection: ${inventory.collection}`,
    `Total hymns: ${inventory.total}`,
    "",
    "isExclusive",
    `  false: ${inventory.isExclusive.false}`,
    `  true: ${inventory.isExclusive.true}`,
    `  missing: ${inventory.isExclusive.missing}`,
    `  invalid: ${inventory.isExclusive.invalid}`,
    "",
    "exclusiveOwnerUid (exclusive documents only)",
    `  valid: ${inventory.exclusiveOwnerUid.valid}`,
    `  missing: ${inventory.exclusiveOwnerUid.missing}`,
    `  invalid: ${inventory.exclusiveOwnerUid.invalid}`,
    "",
    "createdAt",
    `  valid Firestore Timestamp: ${inventory.createdAt.valid}`,
    `  missing: ${inventory.createdAt.missing}`,
    `  invalid/wrong type: ${inventory.createdAt.invalid}`,
    "",
    "schemaVersion",
    `  present + valid: ${inventory.schemaVersion.valid}`,
    `  missing: ${inventory.schemaVersion.missing}`,
    `  invalid/wrong type: ${inventory.schemaVersion.invalid}`,
    `  unsupported by current app: ${inventory.schemaVersion.unsupported}`,
    "",
    "Other metadata field shape (values omitted)",
    `  title present/missing/invalid: ${inventory.title.present}/${inventory.title.missing}/${inventory.title.invalid}`,
    `  key present/missing/invalid: ${inventory.key.present}/${inventory.key.missing}/${inventory.key.invalid}`,
    "",
    "Documents requiring attention (sampled; full IDs in JSON)",
  ];

  for (const [field, title] of Object.entries({
    missingIsExclusive: "Missing isExclusive",
    invalidIsExclusive: "Invalid isExclusive",
    exclusiveMissingOwner: "Exclusive missing owner",
    exclusiveInvalidOwner: "Exclusive invalid owner",
    missingCreatedAt: "Missing createdAt",
    invalidCreatedAt: "Invalid createdAt",
    missingSchemaVersion: "Missing schemaVersion",
    invalidSchemaVersion: "Invalid schemaVersion",
    unsupportedSchemaVersion: "Unsupported schemaVersion",
    missingTitle: "Missing title",
    invalidTitle: "Invalid title",
    missingKey: "Missing key",
    invalidKey: "Invalid key",
  })) {
    lines.push(
      ...formatIds(title, inventory.problemDocumentIds[field], idLimit),
    );
  }

  lines.push("", "Read-only inventory. No Firestore data was modified.");
  return `${lines.join("\n")}\n`;
}
