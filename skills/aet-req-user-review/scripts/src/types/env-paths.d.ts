/**
 * Ambient types for `env-paths` (no @types/env-paths published; the package
 * ships its own types, but declare here in case of type-resolution gaps in
 * the bundler-agnostic tsconfig).
 */
declare module 'env-paths' {
  export interface Paths {
    data: string;
    config: string;
    cache: string;
    log: string;
    temp: string;
  }
  export default function envPaths(
    name: string,
    opts?: { suffix?: string | false; legacy?: boolean },
  ): Paths;
}