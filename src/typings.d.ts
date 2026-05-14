/**
 * Type declarations for third-party markdown-it plugins that lack their own
 * @types packages on npm.
 */

declare module 'markdown-it-anchor' {
  import type { PluginWithOptions } from 'markdown-it';
  const anchorPlugin: PluginWithOptions;
  export default anchorPlugin;
}

declare module 'markdown-it-table-of-contents' {
  import type { PluginSimple } from 'markdown-it';
  const tocPlugin: PluginSimple;
  export default tocPlugin;
}
