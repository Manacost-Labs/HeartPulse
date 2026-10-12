const SVG_NS = 'http://www.w3.org/2000/svg';
const STYLE_PROPERTIES = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'font-size', 'font-weight', 'text-anchor', 'opacity'];

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export an independent snapshot, including computed SVG styles but no remote assets. */
export function chartSvgDocument(source: SVGSVGElement, title: string, caption = ''): string {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const originals = [source, ...source.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    STYLE_PROPERTIES.forEach(property => copies[index].setAttribute(property, style.getPropertyValue(property)));
    copies[index].removeAttribute('tabindex');
    copies[index].removeAttribute('class');
  });
  clone.querySelectorAll('script, image, foreignObject, a').forEach(element => element.remove());
  const box = source.viewBox.baseVal;
  const width = box.width || source.clientWidth;
  const height = box.height || source.clientHeight;
  if (!width || !height) throw new Error('График пока не готов к скачиванию.');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  const wrap = (content: string, size: number) => {
    const limit = Math.max(12, Math.floor((width - 40) / (size * 0.58)));
    const lines = [''];
    content.split(/\s+/).forEach(word => { const last = lines.at(-1) ?? ''; if (last && last.length + word.length + 1 > limit) lines.push(word); else lines[lines.length - 1] = `${last}${last ? ' ' : ''}${word}`; });
    return lines;
  };
  const titleLines = wrap(title, 18);
  const captionLines = caption ? wrap(caption, 12) : [];
  const headerHeight = 26 + titleLines.length * 24 + captionLines.length * 18;
  svg.setAttribute('viewBox', `0 0 ${width} ${height + headerHeight + 40}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height + headerHeight + 40));
  svg.setAttribute('font-family', 'Arial, sans-serif');
  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', '100%');
  background.setAttribute('height', '100%');
  background.setAttribute('fill', '#fbf3de');
  svg.append(background);
  const text = (content: string, y: number, size: number) => {
    const node = document.createElementNS(SVG_NS, 'text');
    node.setAttribute('x', '20');
    node.setAttribute('y', String(y));
    node.setAttribute('fill', '#30251c');
    node.setAttribute('font-size', String(size));
    node.textContent = content;
    return node;
  };
  titleLines.forEach((line, index) => svg.append(text(line, 30 + index * 24, 18)));
  captionLines.forEach((line, index) => svg.append(text(line, 30 + titleLines.length * 24 + index * 18, 12)));
  clone.removeAttribute('style');
  clone.setAttribute('x', '0');
  clone.setAttribute('y', String(headerHeight));
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  svg.append(clone, text('HearthPulse · hearthpulse.net', height + headerHeight + 28, 12));
  return new XMLSerializer().serializeToString(svg);
}

export async function downloadChart(source: SVGSVGElement, title: string, format: 'svg' | 'png', caption = '') {
  return downloadSvgDocument(chartSvgDocument(source, title, caption), title, format);
}

export async function downloadSvgDocument(markup: string, title: string, format: 'svg' | 'png') {
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const filename = (title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'HearthPulse') + `.${format}`;
  if (format === 'svg') return downloadBlob(blob, filename);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Не удалось подготовить изображение. Попробуйте SVG.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    const scale = Math.min(2, 4096 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не поддерживает скачивание PNG. Используйте SVG.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Не удалось создать PNG.')), 'image/png'));
    downloadBlob(png, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Native matrices retain their text and cell colours in an independent SVG. */
export function tableSvgDocument(table: HTMLTableElement, title: string): string {
  const rows = Array.from(table.rows);
  const columns = Math.max(...rows.map(row => row.cells.length), 1);
  const width = columns * 160;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(rows.length * 72 + 88));
  svg.setAttribute('font-family', 'Arial, sans-serif');
  const node = (tag: string, attrs: Record<string, string>, text?: string) => {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    if (text !== undefined) element.textContent = text;
    svg.append(element);
  };
  node('rect', { width: '100%', height: '100%', fill: '#fbf3de' });
  node('text', { x: '12', y: '28', fill: '#30251c', 'font-size': '18' }, title);
  rows.forEach((row, rowIndex) => Array.from(row.cells).forEach((cell, columnIndex) => {
    const x = columnIndex * 160, y = rowIndex * 72 + 44;
    const content = cell.querySelector('button');
    const contentStyle = content ? getComputedStyle(content) : null;
    const style = contentStyle && contentStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ? contentStyle : getComputedStyle(cell);
    node('rect', { x: String(x), y: String(y), width: '160', height: '72', fill: style.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#fbf3de' : style.backgroundColor, stroke: '#d9c8a3' });
    const words = (cell.dataset.exportValue ?? cell.innerText).trim().replace(/\s+/g, ' ').split(' ');
    const lines = [''];
    words.forEach(word => { const previous = lines.at(-1) ?? ''; if ((previous.length + word.length) > 20) lines.push(word); else lines[lines.length - 1] += `${previous ? ' ' : ''}${word}`; });
    lines.slice(0, 3).forEach((line, index) => node('text', { x: String(x + 8), y: String(y + 21 + index * 18), fill: style.color, 'font-size': '12' }, index === 2 && lines.length > 3 ? `${line}…` : line));
  }));
  node('text', { x: '12', y: String(rows.length * 72 + 74), fill: '#735e49', 'font-size': '12' }, 'HearthPulse · hearthpulse.net');
  return new XMLSerializer().serializeToString(svg);
}
