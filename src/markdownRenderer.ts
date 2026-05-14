/**
 * Markdown rendering pipeline powered by **markdown-it**.
 *
 * Bundles heading anchors, a table-of-contents generator, syntax
 * highlighting via highlight.js, and a custom `[[Wiki Link]]` plugin.
 *
 * The exported `render` function is a thin wrapper around a shared
 * `MarkdownIt` instance so callers do not need to manage the parser.
 */

import MarkdownIt from 'markdown-it';
import anchorPlugin from 'markdown-it-anchor';
import tocPlugin from 'markdown-it-table-of-contents';
import hljs from 'highlight.js';

// ── Wiki-link plugin ────────────────────────────────────────────────────────

/**
 * Custom markdown-it plugin that transforms `[[Page Name]]` wiki links
 * into clickable `<a>` elements.
 *
 * Regex: `/\[\[([^\]]+)\]\]/g` — matches the shortest possible content
 * between a pair of double brackets. This deliberately diverges from
 * GitLab's greedy "consume the rest of the line" behaviour.
 *
 * The rendered link carries class `wikilab-wiki-link` and an
 * `data-wiki-target` attribute (the slug derived from the link text)
 * so that the frontend can intercept clicks and navigate inside
 * JupyterLab rather than doing a full page navigation.
 */
function wikiLinkPlugin(md: MarkdownIt): void {
  md.core.ruler.push('wikilab-wiki-links', (state): void => {
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Only process inline tokens that contain text
      if (token.type !== 'inline' || typeof token.content !== 'string') {
        continue;
      }

      // Skip if there are no wiki links in this token
      if (!/\[\[([^\]]+)\]\]/.test(token.content)) {
        continue;
      }

      // Walk the inline child tokens and rewrite text that looks like
      // a wiki link into a link token.
      if (token.children) {
        const rebuilt: typeof token.children = [];

        for (let j = 0; j < token.children.length; j++) {
          const child = token.children[j];

          // Only rewrite plain text tokens
          if (child.type !== 'text' || typeof child.content !== 'string') {
            rebuilt.push(child);
            continue;
          }

          // Split on wiki-link pattern and rebuild
          const parts = child.content.split(/(\[\[([^\]]+)\]\])/g);

          for (let k = 0; k < parts.length; k++) {
            const part = parts[k];

            // Check if this part looks like a wiki link
            const match = /^\[\[([^\]]+)\]\]$/.exec(part);
            if (match) {
              const linkText = match[1];
              const slug = linkText
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');

              // Create a new opening link token
              const openLink = new state.Token('link_open', 'a', 1);
              openLink.attrs = [
                ['class', 'wikilab-wiki-link'],
                ['data-wiki-target', slug],
                ['href', `#${slug}`]
              ];
              openLink.level = 1;

              // Text token with display name
              const textTkn = new state.Token('text', '', 0);
              textTkn.content = linkText;

              // Closing link token
              const closeLink = new state.Token('link_close', 'a', -1);

              rebuilt.push(openLink, textTkn, closeLink);
            } else {
              // Keep original token but clone its content
              const clone = new state.Token(
                child.type,
                child.tag,
                child.nesting
              );
              clone.content = part;
              clone.attrs = child.attrs ? [...child.attrs] : null;
              clone.children = child.children ? [...child.children] : null;
              rebuilt.push(clone);
            }
          }
        }

        token.children = rebuilt;
      }
    }
  });
}

// ── Shared MarkdownIt instance ──────────────────────────────────────────────

/**
 * Build and return a fully-configured `MarkdownIt` instance.
 *
 * Plugins are applied in the order listed so that the wiki-link
 * transformation runs after core inline parsing but before anchor
 * heading generation (anchors need the final rendered text).
 */
function _createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    html: false, // Disallow raw HTML for safety
    linkify: true, // Auto-link URLs
    typographer: true, // Smart quotes, en/em dashes, etc.
    breaks: false // Do not auto-convert \n to <br>
  });

  // Heading anchors (auto-generated from heading text)
  md.use(anchorPlugin, {
    level: [2, 3],
    slugify: (s: string): string =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
  });

  // Table of contents — expects `[[TOC]]` or `[_TOC_]` in source
  md.use(tocPlugin, {
    includeLevel: [2, 3],
    formatter(token: { content: string }): string {
      return token.content
        .replace(/<[^>]*>/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
  });

  // Syntax highlighting via highlight.js (auto-detect language)
  md.use((instance: MarkdownIt): void => {
    instance.set({
      highlight(code: string, lang?: string): string {
        if (!lang) {
          return hljs.highlightAuto(code).value;
        }
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch {
          return hljs.highlightAuto(code).value;
        }
      }
    });
  });

  // Wiki link transformation
  md.use(wikiLinkPlugin);

  return md;
}

// ── Public API ──────────────────────────────────────────────────────────────

let _instance: MarkdownIt | null = null;

/**
 * Return a shared `MarkdownIt` instance.
 *
 * The instance is lazily initialised and reused across calls.
 */
export function getRenderer(): MarkdownIt {
  if (!_instance) {
    _instance = _createMarkdownIt();
  }
  return _instance;
}

/**
 * Render a markdown string to HTML.
 *
 * @param markdown — the markdown source text
 * @returns rendered HTML string
 */
export function render(markdown: string): string {
  return getRenderer().render(markdown);
}
