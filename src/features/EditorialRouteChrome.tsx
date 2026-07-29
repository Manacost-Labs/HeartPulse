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
    <>
      <div
        className="section-banner-modern relative overflow-hidden hidden sm:flex -mx-6 md:-mx-10 -mt-6 md:-mt-10 mb-6 flex-col items-start justify-center gap-1 px-8 md:px-10"
        style={{
          height: 'clamp(120px, 13vw, 165px)',
          background: [
            'radial-gradient(circle at 82% 18%, rgba(246,206,104,0.24), transparent 26rem)',
            'linear-gradient(135deg, rgba(9,21,39,0.96), rgba(23,43,72,0.9) 54%, rgba(58,31,22,0.74))',
          ].join(', '),
          borderBottom: '1px solid rgba(246, 206, 104, 0.25)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -18px 34px rgba(5,10,19,0.22)',
        }}
      >
        <h1
          className="font-hs"
          style={{
            fontSize: 'clamp(1.6rem, 3.5vw, 2.55rem)',
            color: '#fff7cf',
            textShadow: '0 3px 18px rgba(0,0,0,0.48)',
          }}
        >
          {title}
        </h1>
        <p
          className="font-body font-semibold"
          style={{
            fontSize: 'clamp(0.75rem, 1.4vw, 0.9rem)',
            color: '#c8d5e8',
            textShadow: '0 1px 8px rgba(0,0,0,0.48)',
          }}
        >
          {subtitle}
        </p>
      </div>

      <div
        className="sm:hidden -mx-3 -mt-3 mb-5 px-4 py-4 section-banner-modern"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.96), rgba(232,241,255,0.92))',
          borderBottom: '1px solid rgba(148,163,184,0.34)',
        }}
      >
        <h1
          className="font-hs tracking-wide"
          style={{ fontSize: '1.5rem', color: '#1f3654' }}
        >
          {title}
        </h1>
        <p className="text-[#52667f] text-xs mt-0.5 font-semibold">{subtitle}</p>
      </div>
    </>
  );
}
