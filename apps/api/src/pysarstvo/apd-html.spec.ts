import { buildApdHtml, cleanText } from './apd-html';

describe('cleanText', () => {
  it('strips control characters and trims', () => {
    expect(cleanText('  Орел\u0000\u0007 ')).toBe('Орел');
  });
});

describe('buildApdHtml', () => {
  it('builds a title plus the two sections for every pseudo', () => {
    const html = buildApdHtml('АПД сходини', ['Орел', 'Вовк']);
    expect(html).toContain('<h1>АПД сходини</h1>');
    expect(html).toContain('<h2>Орел</h2>');
    expect(html).toContain('<h2>Вовк</h2>');
    expect(html.match(/<h3>Що було добре:<\/h3>/g)).toHaveLength(2);
    expect(html.match(/<h3>Що можна покращити:<\/h3>/g)).toHaveLength(2);
    expect(html.match(/<ul><li>/g)).toHaveLength(4);
  });

  it('keeps pseudos in the given order', () => {
    const html = buildApdHtml('T', ['Б', 'А']);
    expect(html.indexOf('<h2>Б</h2>')).toBeLessThan(html.indexOf('<h2>А</h2>'));
  });

  it('escapes HTML in the title and pseudos', () => {
    const html = buildApdHtml('<b>x</b>', ['A & <i>B</i>']);
    expect(html).toContain('<h1>&lt;b&gt;x&lt;/b&gt;</h1>');
    expect(html).toContain('<h2>A &amp; &lt;i&gt;B&lt;/i&gt;</h2>');
    expect(html).not.toContain('<b>');
  });
});
