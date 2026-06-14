describe('icon()', () => {
  it('returns an <svg> for a known line icon', () => {
    const html = icon('cards');
    assert(html.startsWith('<svg'), 'is an svg');
    assert(html.includes('class="ic '), 'has .ic class');
    assert(html.includes('fill="currentColor"'), 'inherits color');
    assert(html.includes('aria-hidden="true"'), 'decorative');
  });
  it('returns the fill weight for headline icons', () => {
    assert(icon('crown', {fill:true}).startsWith('<svg'), 'crown fill exists');
  });
  it('applies an extra class', () => {
    assert(icon('cards', {cls:'big'}).includes('class="ic big"'), 'extra class present');
  });
  it('returns empty string for an unknown icon', () => {
    assertEqual(icon('does-not-exist'), '');
  });
  it('falls back to regular when fill weight is absent', () => {
    assertEqual(icon('cards', {fill:true}), icon('cards'));
  });
});
