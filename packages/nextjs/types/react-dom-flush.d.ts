/** Minimal typings for `react-dom` when only `flushSync` is imported. */
declare module "react-dom" {
  export function flushSync<R>(fn: () => R): R;
}
