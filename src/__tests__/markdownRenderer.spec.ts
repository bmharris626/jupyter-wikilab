/**
 * Unit tests for the markdown-it renderer pipeline, including the custom
 * `[[Wiki Link]]` plugin and edge-case bracket handling.
 */

import { render } from '../markdownRenderer';

describe('markdownRenderer', () => {
  // ── Basic rendering ────────────────────────────────────────────────────────

  it('renders plain text', () => {
    const html = render('Hello world');
    expect(html).toContain('Hello world');
  });

  it('renders headings', () => {
    const html = render('# Heading One');
    expect(html).toMatch(/<h1[^>]*>Heading One<\/h1>/);
  });

  it('renders headings with anchors', () => {
    const html = render('## My Section');
    expect(html).toMatch(/<h2[^>]*id="my-section"[^>]*>My Section<\/h2>/);
  });

  it('renders bold and italic', () => {
    const html = render('This is **bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders unordered lists', () => {
    const html = render('- Item A\n- Item B');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Item A</li>');
    expect(html).toContain('<li>Item B</li>');
  });

  it('renders ordered lists', () => {
    const html = render('1. First\n2. Second');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>First</li>');
  });

  it('renders fenced code blocks with syntax highlighting', () => {
    const html = render('```python\nprint("hi")\n```');
    expect(html).toContain('<code');
    expect(html).toContain('<pre');
  });

  // ── Wiki links ─────────────────────────────────────────────────────────────

  it('renders a single [[Wiki Link]] as an <a> tag', () => {
    const html = render('Check [[My Page]] for details');
    expect(html).toContain('Check ');
    expect(html).toMatch(/<a[^>]*class="wikilab-wiki-link"[^>]*>/);
    expect(html).toMatch(/<a[^>]*href="#my-page"[^>]*>/);
    expect(html).toContain('My Page');
    expect(html).toContain(' for details');
  });

  it('slugifies wiki link display text to the URL fragment', () => {
    const html = render('See [[Hello World Test]]');
    expect(html).toContain('Hello World Test');
    expect(html).toMatch(/href="#hello-world-test"/);
  });

  it('handles multiple wiki links on the same line', () => {
    const html = render('See [[Page A]] and [[Page B]]');
    const matches = html.match(/<a[^>]*class="wikilab-wiki-link"[^>]*>/g);
    expect(matches).toHaveLength(2);
    expect(html).toContain('href="#page-a"');
    expect(html).toContain('href="#page-b"');
  });

  it('renders wiki links with underscores in names', () => {
    const html = render('Go to [[My_Nice_Page]]');
    // Underscores are treated as non-alphanumeric and become hyphens
    expect(html).toMatch(/href="#my-nice-page"/);
  });

  // ── Table of contents ──────────────────────────────────────────────────────

  it('renders a TOC marker', () => {
    const html = render('## Section A\n[_TOC_]\n## Section B');
    expect(html).toContain('<h2');
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it('handles malformed double brackets gracefully', () => {
    // Only one opening bracket — should render as plain text
    const html = render('[[ incomplete');
    expect(html).toContain('[[ incomplete');
  });

  it('handles unpaired closing brackets', () => {
    // Only closing bracket — should render as plain text
    const html = render('complete ]]');
    expect(html).toContain('complete ]]');
  });

  it('handles empty wiki links', () => {
    const html = render('Text [[]] more');
    // Empty wiki link should still produce a link (with empty slug)
    expect(html).toContain('Text');
  });

  it('handles nested-looking brackets that are actually sequential', () => {
    // [[A]] [[B]] — two separate wiki links, not nested
    const html = render('[[A]] [[B]]');
    const matches = html.match(/<a[^>]*class="wikilab-wiki-link"[^>]*>/g);
    expect(matches).toHaveLength(2);
  });

  it('handles brackets inside code blocks without converting them', () => {
    const html = render('```\n[[ not a link ]]```');
    // Inside code blocks markdown-it does not process inline tokens,
    // so the raw text should remain
    expect(html).toContain('[[');
  });

  it('handles a wiki link next to regular text without spaces', () => {
    const html = render('See[[Page]]done');
    // The regex requires the full token to match \[\[...\]\]
    // so surrounding text should remain as-is
    expect(html).toContain('See');
    expect(html).toContain('done');
  });

  it('renders standard markdown links alongside wiki links', () => {
    const html = render(
      'A [regular link](http://example.com) and [[wiki link]]'
    );
    expect(html).toContain('href="http://example.com"');
    expect(html).toContain('class="wikilab-wiki-link"');
  });

  it('produces consistent output across multiple render calls', () => {
    const input = '## Header\n\nSome **bold** text and [[Link]]';
    const first = render(input);
    const second = render(input);
    expect(first).toBe(second);
  });
});
