import { useEffect, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { anchoredImagePreviewLayout } from './anchoredImagePreviewLayout';
import './AnchoredImagePreview.css';

type Props = HTMLAttributes<HTMLElement> & {
  source: string;
  fallbackSource: string;
  name: string;
  accessibleName: string;
  anchorRect: DOMRect;
  previewId: string;
};

/** A passive hover image; callers own the trigger, navigation and touch interaction. */
export function AnchoredImagePreview({ source: preferredSource, fallbackSource, name, accessibleName, anchorRect, previewId, className = '', ...attributes }: Props) {
  const [visible, setVisible] = useState(false);
  const [source, setSource] = useState(preferredSource);
  const [loadedSource, setLoadedSource] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 120);
    const dismiss = () => {
      window.clearTimeout(timer);
      setVisible(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, []);

  if (!visible || typeof document === 'undefined') return null;
  const layout = anchoredImagePreviewLayout(anchorRect, window.innerWidth, window.innerHeight);
  const loaded = loadedSource === source;

  return createPortal(
    <aside
      {...attributes}
      className={`anchored-image-preview ${className}`.trim()}
      style={layout}
      role="tooltip"
      aria-label={accessibleName}
      data-image-preview-id={previewId}
      data-preview-state={failed ? 'error' : loaded ? 'loaded' : 'loading'}
    >
      <div className="anchored-image-preview__name">{name}</div>
      <div className="anchored-image-preview__media" aria-busy={!loaded && !failed}>
        {!failed && <img
          key={source}
          src={source}
          alt={name}
          className={loaded ? 'is-loaded' : ''}
          onLoad={() => setLoadedSource(source)}
          onError={() => {
            if (source !== fallbackSource) setSource(fallbackSource);
            else setFailed(true);
          }}
        />}
        {!loaded && <span className="anchored-image-preview__status">
          {failed ? 'Изображение временно недоступно' : 'Загрузка изображения…'}
        </span>}
      </div>
    </aside>,
    document.body,
  );
}
