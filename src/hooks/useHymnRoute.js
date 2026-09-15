import { useCallback, useEffect, useState } from "react";

export function parseHymnIdFromPath(pathname = window.location.pathname) {
  const match = String(pathname || "").match(/\/h\/([^/]+)\/?$/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function hymnSharePath(id) {
  return id ? `/h/${encodeURIComponent(id)}` : "/";
}

export function hymnShareUrl(id, origin = window.location.origin) {
  return `${origin}${hymnSharePath(id)}`;
}

export function useHymnRoute() {
  const [routeHymnId, setRouteHymnId] = useState(() =>
    typeof window === "undefined" ? "" : parseHymnIdFromPath(),
  );

  useEffect(() => {
    const onPop = () => setRouteHymnId(parseHymnIdFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigateHymn = useCallback((id, { replace = false } = {}) => {
    const nextId = String(id || "");
    const nextPath = hymnSharePath(nextId);
    if (window.location.pathname !== nextPath) {
      const method = replace ? "replaceState" : "pushState";
      window.history[method]({ hymnId: nextId }, "", nextPath);
    }
    setRouteHymnId(nextId);
  }, []);

  return { routeHymnId, navigateHymn };
}
