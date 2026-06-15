import { useEffect, useState } from "react";

/**
 * useDebouncedValue — trailing-edge debounce for a reactive value.
 *
 * Returns the latest `value` after `delay` ms of inactivity. Changing the
 * value resets the timer. Used by the SearchFilter to keep bento tile
 * re-renders cheap while the user is actively typing.
 *
 * The effect cleanup clears the pending timer on every run, so fast
 * successive changes collapse into a single trailing update. Unmount
 * during the debounce window also cancels cleanly. Zero / negative
 * delays schedule a macrotask (`setTimeout(…, 0)`) rather than calling
 * `setState` synchronously inside the effect — this keeps the
 * `react-hooks/set-state-in-effect` contract while still effectively
 * short-circuiting the debounce for callers that pass `delay <= 0`.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const clamped = delay > 0 ? delay : 0;
    const id = window.setTimeout(() => setDebounced(value), clamped);
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
