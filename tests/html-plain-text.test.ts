import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeHTML } from 'entities';
import { htmlPlainText } from '../src/shared/text/htmlPlainText';
assert.equal(typeof document, 'undefined');
assert.equal(htmlPlainText('<b>Боевой клич:</b><br> A &amp; B &#x1F525; &hearts;'), 'Боевой клич:\n A & B 🔥 ♥');
assert.equal(htmlPlainText('&lt;script&gt;alert(1)&lt;/script&gt;'), '<script>alert(1)</script>');
assert.equal(htmlPlainText(null), '');

// Invalid numeric references become U+FFFD and C1 controls follow the
// Windows-1252 remap of the HTML specification, as the browser parser does.
assert.equal(htmlPlainText('a&#0;b&#xD800;c&#x110000;d'), 'a�b�c�d');
assert.equal(htmlPlainText('1&#150;2 &#128;'), '1–2 €');
assert.equal(htmlPlainText('&unknown; & a bare ampersand'), '&unknown; & a bare ampersand');
assert.equal(htmlPlainText('&amp;lt;'), '&lt;', 'a reference is decoded once');
assert.equal(htmlPlainText('«&laquo;Ход&raquo;» &mdash; &nbsp;x'), '««Ход»» —  x');

// The decoder replaced the `entities` package in the browser bundle (15 KiB
// of gzip tables on every card page). It must agree with that reference on
// every terminated reference it knows and on numeric references.
const decoderSource = readFileSync(new URL('../src/shared/text/htmlPlainText.ts', import.meta.url), 'utf8');
assert.doesNotMatch(decoderSource, /from ['"]entities['"]/, 'card pages must not ship the entities decode tables');
const names = [...decoderSource.matchAll(/^\s+\[?'?([A-Za-z][A-Za-z0-9]*)'?\]?: '/gm)].map(match => match[1]);
assert.ok(names.length >= 25, `the named reference map must be readable by this test (found ${names.length})`);
for (const name of names) {
  assert.equal(htmlPlainText(`x&${name};y`), decodeHTML(`x&${name};y`), `&${name}; must decode like the HTML parser`);
}
let seed = 20261004;
const random = () => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed / 2_147_483_648; };
for (let index = 0; index < 10_000; index += 1) {
  const codePoint = index < 512 ? index : Math.floor(random() * 0x110100);
  for (const reference of [`&#${codePoint};`, `&#x${codePoint.toString(16)};`, `&#X${codePoint.toString(16).toUpperCase()};`]) {
    assert.equal(htmlPlainText(`x${reference}y`), decodeHTML(`x${reference}y`), `${reference} must decode like the HTML parser`);
  }
}
console.log('DOM-independent catalog text assertions passed');
