import assert from 'node:assert/strict';
import { htmlPlainText } from '../src/shared/text/htmlPlainText';
assert.equal(typeof document, 'undefined');
assert.equal(htmlPlainText('<b>Боевой клич:</b><br> A &amp; B &#x1F525; &hearts;'), 'Боевой клич:\n A & B 🔥 ♥');
assert.equal(htmlPlainText('&lt;script&gt;alert(1)&lt;/script&gt;'), '<script>alert(1)</script>');
assert.equal(htmlPlainText(null), '');
console.log('DOM-independent catalog text assertions passed');
