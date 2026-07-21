export function inspectHorizontalLayoutFault() {
  const root = document.documentElement;
  const isVisible = element => {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0 && bounds.width > 0 && bounds.height > 0;
  };
  const describe = element => {
    if (!(element instanceof Element)) return null;
    const names = [];
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      const id = current.id ? `#${current.id}` : '';
      const classes = [...current.classList].slice(0, 2).map(name => `.${name}`).join('');
      names.unshift(`${current.tagName.toLowerCase()}${id}${classes}`);
      if (names.length === 4) break;
    }
    return names.join(' > ');
  };
  const hasIntentionalHorizontalScroller = element => {
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const overflow = getComputedStyle(ancestor).overflowX;
      if (['auto', 'scroll'].includes(overflow) && ancestor.scrollWidth > ancestor.clientWidth + 1) return true;
    }
    return false;
  };
  const rect = element => {
    const bounds = element?.getBoundingClientRect();
    return bounds ? {
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
    } : null;
  };
  const firstPageOverflowElement = [...document.body.querySelectorAll('*')]
    .filter(isVisible)
    .find(element => {
      const bounds = element.getBoundingClientRect();
      return (bounds.left < -1 || bounds.right > innerWidth + 1)
        && !hasIntentionalHorizontalScroller(element);
    });

  return {
    viewport: { width: innerWidth, height: innerHeight },
    page: { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth },
    firstLayoutFault: firstPageOverflowElement
      ? { kind: 'page-overflow', element: describe(firstPageOverflowElement), rect: rect(firstPageOverflowElement) }
      : null,
  };
}
