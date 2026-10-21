import { useState } from 'react';
import { X } from 'lucide-react';
import ModalSurface from './ModalSurface';
import { LightboxImage } from './LightboxImage';

const PICTURE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="776"><rect width="512" height="776" rx="40" fill="#7a2b16"/><circle cx="256" cy="300" r="150" fill="#e7b85b"/></svg>')}`;

/** A thumbnail on a page and the zooming lightbox it opens (stories only). */
export default function LightboxZoomFixture() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ padding: 32, minHeight: "100vh", background: "#f1e1bd" }}>
      <button type="button" aria-label="Открыть картинку" data-lightbox-src={PICTURE} onClick={() => setOpen(true)}
        style={{ border: 0, padding: 0, background: 'none' }}>
        <img src={PICTURE} alt="" width={128} height={194} />
      </button>
      {open && (
        <ModalSurface className="lightbox-zoom-story" panelClassName="lightbox-zoom-story__panel" ariaLabel="Картинка"
          onClose={() => setOpen(false)} zoom>
          <button type="button" aria-label="Закрыть" data-modal-close=""><X aria-hidden="true" /></button>
          <LightboxImage src={PICTURE} alt="Картинка" />
        </ModalSurface>
      )}
      <style>{`.lightbox-zoom-story { z-index: 1000; display: grid; place-items: center; }
.lightbox-zoom-story .modal-surface__backdrop { position: absolute; inset: 0; border: 0; background: rgba(20, 11, 7, .88); }
.lightbox-zoom-story__panel { position: relative; display: grid; gap: 8px; padding: 12px; background: #1d120c; }
.lightbox-zoom-story__panel img { width: min(80vw, 360px); height: auto; }`}</style>
    </div>
  );
}
