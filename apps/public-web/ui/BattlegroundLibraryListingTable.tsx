'use client';

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * One tier of a listing as a table. The page carries every element twice (in the HTML and in the RSC payload), and a
 * listing has three hundred cards, so the payload holds a plain text line per card (`name\tpath\tcell\tcell…`, already
 * formatted) and the markup is a string without the optional end tags (valid HTML): an element per cell would push the
 * page far past its 250 KB budget. Every value is escaped; the path was checked against the library paths by the parser
 * and the text comes from the parsed allowlist, never raw from Express.
 */
function table(caption: string, headers: string[], rows: string): string {
  const body = rows.split('\n').map(line => {
    const [name, path, ...cells] = line.split('\t');
    return `<tr><th scope=row><a href="${escapeHtml(path)}">${escapeHtml(name)}</a>${cells.map(cell => `<td>${escapeHtml(cell)}`).join('')}`;
  }).join('');
  return `<table><caption>${escapeHtml(caption)}</caption><thead><tr>${headers.map(header => `<th scope=col>${escapeHtml(header)}`).join('')}`
    + `<tbody>${body}</table>`;
}

export function LibraryListingTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string }) {
  return <div className="bg-library-public__scroll" dangerouslySetInnerHTML={{ __html: table(caption, headers, rows) }} />;
}
