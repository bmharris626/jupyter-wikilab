/**
 * Validates the wikilab settings schema file.
 */

import schema from '../../schema/plugin.json';

describe('schema/plugin.json', () => {
  it('is valid JSON', () => {
    expect(schema).toBeDefined();
  });

  it('has a title', () => {
    expect(schema.title).toBe('WikiLab');
  });

  it('has properties', () => {
    expect(schema.properties).toBeDefined();
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props)).toHaveLength(2);
  });

  it('defines committerEmail with string type and default', () => {
    const props = schema.properties as Record<string, unknown>;
    const committerEmail = props.committerEmail as Record<string, string>;
    expect(committerEmail.type).toBe('string');
    expect(committerEmail.default).toMatch(/@wikilab/);
    expect(committerEmail.title).toBe('Committer Email');
  });

  it('defines defaultWikiPath with string type and default', () => {
    const props = schema.properties as Record<string, unknown>;
    const defaultWikiPath = props.defaultWikiPath as Record<string, string>;
    expect(defaultWikiPath.type).toBe('string');
    expect(defaultWikiPath.default).toBe('./wikis');
    expect(defaultWikiPath.title).toBe('Default Wiki Path');
  });

  it('disables additional properties', () => {
    expect(schema.additionalProperties).toBe(false);
  });
});
