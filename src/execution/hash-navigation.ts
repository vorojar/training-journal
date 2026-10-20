import {
  createContext,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { formatRoute, parseRoute, type Route } from "./routes";

export const EditorNavigationContext = createContext({
  setDirty: (_dirty: boolean) => {},
  setSaving: (_saving: boolean) => {},
});
type Marker = { session: string; position: number; parent?: string };
function storedMarker(): Marker | undefined {
  const value = window.history.state?.fitnessRoute;
  return typeof value?.session === "string" &&
    value.session.length <= 100 &&
    Number.isSafeInteger(value.position) &&
    value.position >= 0
    ? value
    : undefined;
}
export function useHashNavigation(
  canLeave: (retry: () => void) => boolean,
  hasUnsaved: () => boolean,
) {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const initial = useRef<Marker>(
    storedMarker() || { session: crypto.randomUUID(), position: 0 },
  );
  const current = useRef(formatRoute(route)),
    position = useRef(initial.current.position),
    session = useRef(initial.current.session),
    restoring = useRef(false);
  const approved = useRef<string | null>(null),
    afterRestore = useRef<(() => void) | null>(null);
  const guard = useRef(canLeave),
    unsaved = useRef(hasUnsaved);
  guard.current = canLeave;
  unsaved.current = hasUnsaved;
  function marker(): Marker | undefined {
    const value = storedMarker();
    return value?.session === session.current ? value : undefined;
  }
  function replace(hash: string, mark: Marker) {
    window.history.replaceState(
      { ...window.history.state, fitnessRoute: mark },
      "",
      hash,
    );
  }
  const accept = useCallback((next: Route) => {
    current.current = formatRoute(next);
    setRoute(next);
  }, []);
  useLayoutEffect(() => {
    replace(current.current, initial.current);
    function onLocation() {
      const next = parseRoute(window.location.hash),
        hash = formatRoute(next),
        target = marker();
      if (restoring.current) {
        if (hash === current.current) {
          restoring.current = false;
          position.current = target?.position ?? position.current;
          const retry = afterRestore.current;
          afterRestore.current = null;
          if (retry) queueMicrotask(retry);
        }
        return;
      }
      if (hash === current.current) {
        if (target) position.current = target.position;
        if (window.location.hash !== hash)
          replace(
            hash,
            target || { session: session.current, position: position.current },
          );
        return;
      }
      const commit = () => {
        if (target) position.current = target.position;
        else {
          session.current = crypto.randomUUID();
          position.current = 0;
        }
        replace(
          hash,
          target || { session: session.current, position: position.current },
        );
        accept(next);
      };
      const retry = () => {
        if (target && target.position !== position.current) {
          const traverse = () => {
            approved.current = hash;
            window.history.go(target.position - position.current);
          };
          if (restoring.current) afterRestore.current = traverse;
          else traverse();
        } else commit();
      };
      if (approved.current !== hash && !guard.current(retry)) {
        // Restore the position as well as the URL while the app asks about unsaved edits.
        if (target && target.position !== position.current) {
          restoring.current = true;
          window.history.go(position.current - target.position);
        } else {
          // An address entered outside this router has no reliable history offset.
          session.current = crypto.randomUUID();
          position.current = 0;
          replace(current.current, { session: session.current, position: 0 });
        }
        return;
      }
      approved.current = null;
      commit();
    }
    function beforeUnload(e: BeforeUnloadEvent) {
      if (unsaved.current()) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("popstate", onLocation);
    window.addEventListener("hashchange", onLocation);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("popstate", onLocation);
      window.removeEventListener("hashchange", onLocation);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [accept]);
  function navigate(
    next: Route,
    options: { replace?: boolean; parent?: string; skipGuard?: boolean } = {},
  ) {
    const hash = formatRoute(next);
    if (hash === current.current) return;
    const perform = () => {
      const mark: Marker = {
        session: session.current,
        position: position.current + (options.replace ? 0 : 1),
        ...(options.parent ? { parent: options.parent } : {}),
      };
      if (options.replace) replace(hash, mark);
      else window.history.pushState({ fitnessRoute: mark }, "", hash);
      position.current = mark.position;
      accept(next);
    };
    if (options.skipGuard || guard.current(perform)) perform();
  }
  function close() {
    if (!route.edit) return;
    const perform = () => {
      const parent = { ...route, edit: undefined },
        hash = formatRoute(parent),
        mark = marker();
      if (mark?.parent === hash && mark.position > 0) window.history.back();
      else navigate(parent, { replace: true, skipGuard: true });
    };
    if (guard.current(perform)) perform();
  }
  return { route, navigate, close };
}
