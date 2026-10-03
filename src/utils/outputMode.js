export const OUTPUT_PROFILE = {
  PRINT: "print",
  PROJECTION: "projection",
};

export function normalizeOutputFontSize(value) {
  const fontSize = Number(value);
  if (!Number.isFinite(fontSize)) return 36;
  return Math.min(72, Math.max(18, Math.round(fontSize)));
}

export function createOutputViewOptions(settings = {}) {
  return {
    profile:
      settings.profile === OUTPUT_PROFILE.PROJECTION
        ? OUTPUT_PROFILE.PROJECTION
        : OUTPUT_PROFILE.PRINT,
    fontSize: normalizeOutputFontSize(settings.fontSize),
    showChords: settings.showChords !== false,
    showKey: settings.showKey !== false,
  };
}

export function requestBrowserPrint(windowRef = globalThis.window) {
  if (typeof windowRef?.print !== "function") return false;
  try {
    windowRef.print();
    return true;
  } catch {
    return false;
  }
}
