import React from 'react';

export function Breadcrumbs({
  items,
}: {
  items: Array<{ name: string; href: string; onClick?: () => void }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol
        className="flex items-center gap-1 flex-wrap text-xs text-[#8b6c42]"
        itemScope
        itemType="https://schema.org/BreadcrumbList"
      >
        {items.map((item, index) => (
          <li
            key={`${item.href}:${item.name}`}
            className="flex items-center gap-1"
            itemProp="itemListElement"
            itemScope
            itemType="https://schema.org/ListItem"
          >
            {index < items.length - 1 ? (
              <>
                <a
                  itemProp="item"
                  href={item.href}
                  onClick={item.onClick ? event => {
                    event.preventDefault();
                    item.onClick?.();
                  } : undefined}
                  className="inline-flex min-h-11 items-center hover:text-[#4a3018] transition-colors"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <span itemProp="name">{item.name}</span>
                </a>
                <span className="opacity-50">›</span>
              </>
            ) : (
              <span itemProp="name" className="text-[#4a3018] font-medium">
                {item.name}
              </span>
            )}
            <meta itemProp="position" content={String(index + 1)} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SectionBanner({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="section-banner-modern relative -mx-3 -mt-3 mb-5 flex flex-col items-start justify-center gap-1 overflow-hidden px-4 py-4 sm:-mx-6 sm:-mt-6 sm:mb-6 sm:px-8 md:-mx-10 md:-mt-10 md:px-10">
      <h1
        className="font-hs tracking-wide"
        style={{
          fontSize: 'clamp(1.5rem, 3.5vw, 2.55rem)',
          color: '#fff7cf',
          textShadow: '0 3px 18px rgba(0,0,0,0.48)',
        }}
      >
        {title}
      </h1>
      <p
        className="font-body text-xs font-semibold sm:text-sm"
        style={{
          color: '#c8d5e8',
          textShadow: '0 1px 8px rgba(0,0,0,0.48)',
        }}
      >
        {subtitle}
      </p>
    </header>
  );
}
