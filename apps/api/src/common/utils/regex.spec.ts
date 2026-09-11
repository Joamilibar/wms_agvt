import { escapeRegex } from './regex.js';

describe('escapeRegex', () => {
  it('leaves plain identifiers untouched', () => {
    expect(escapeRegex('SKU-001')).toBe('SKU-001');
  });

  it('escapes every regex metacharacter', () => {
    const input = '.*+?^${}()|[]\\';
    const escaped = escapeRegex(input);
    expect(new RegExp(escaped).test(input)).toBe(true);
    expect(new RegExp(escaped).test('anything else')).toBe(false);
  });

  it('turns a wildcard search into a literal match', () => {
    const re = new RegExp(escapeRegex('.*'), 'i');
    expect(re.test('SKU-001')).toBe(false);
    expect(re.test('a.*b')).toBe(true);
  });
});
