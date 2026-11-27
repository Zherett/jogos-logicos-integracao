import { useCallback, useEffect, useRef } from "react";

export interface TimeoutRegistry {
  schedule: (fn: () => void, ms: number) => number;
  clearAll: () => void;
  size: () => number;
}

/**
 * Registro puro e seguro para navegadores e Node para agendar `setTimeout`
 * com remoção automática ao disparar e cancelamento em lote via `clearAll`.
 */
export function createTimeoutRegistry(
  setFn: (fn: () => void, ms: number) => number = (fn, ms) =>
    globalThis.setTimeout(fn, ms) as unknown as number,
  clearFn: (id: number) => void = (id) =>
    globalThis.clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
): TimeoutRegistry {
  const active = new Set<number>();

  const schedule = (fn: () => void, ms: number): number => {
    let id = 0;
    id = setFn(() => {
      active.delete(id);
      fn();
    }, ms);
    active.add(id);
    return id;
  };

  const clearAll = (): void => {
    for (const id of active) {
      clearFn(id);
    }
    active.clear();
  };

  return {
    schedule,
    clearAll,
    size: () => active.size,
  };
}

/**
 * Hook React que rastreia todos os `setTimeout` criados pelo componente
 * e garante limpeza automática ao reiniciar (`clearAll`) ou desmontar.
 */
export function useSafeTimeouts(): {
  schedule: (fn: () => void, ms: number) => number;
  clearAll: () => void;
} {
  const registryRef = useRef<TimeoutRegistry | null>(null);
  if (!registryRef.current) {
    registryRef.current = createTimeoutRegistry(
      (fn, ms) => (typeof window !== "undefined" ? window.setTimeout(fn, ms) : (globalThis.setTimeout(fn, ms) as unknown as number)),
      (id) => {
        if (typeof window !== "undefined") window.clearTimeout(id);
        else globalThis.clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
      },
    );
  }

  const schedule = useCallback((fn: () => void, ms: number) => {
    return registryRef.current!.schedule(fn, ms);
  }, []);

  const clearAll = useCallback(() => {
    registryRef.current?.clearAll();
  }, []);

  useEffect(() => {
    return () => {
      registryRef.current?.clearAll();
    };
  }, []);

  return { schedule, clearAll };
}
