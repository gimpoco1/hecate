/** Keeps late async results from restoring state after a close or account change. */
export function createRequestGuard() {
  let generation = 0;
  return {
    begin() {
      const requestGeneration = ++generation;
      return () => requestGeneration === generation;
    },
    invalidate() {
      generation += 1;
    },
  };
}
