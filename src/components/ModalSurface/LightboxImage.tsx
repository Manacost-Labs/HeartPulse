import { useContext, useState, type SyntheticEvent } from 'react';
import { lightboxImageDecoded } from '../../shared/ui/lightboxIntent';
import { LightboxOriginContext } from './ModalSurface';

type LightboxImageProps = {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  className?: string;
  /** A smaller copy already on the page; defaults to the picture that opened the lightbox. */
  thumb?: string | null;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
};

/**
 * The picture of a zooming lightbox (`data-lightbox-media`). Its first frame
 * shows the copy already loaded on the page, so the zoom has a picture at
 * once; the full size loads beside it and replaces it in the same box once
 * decoded, without a blank frame. A full size preloaded on hover is shown
 * straight away.
 */
export function LightboxImage({ src, srcSet, sizes, alt, className, thumb, onError }: LightboxImageProps) {
  const origin = useContext(LightboxOriginContext);
  const preview = thumb ?? origin;
  const [sharp, setSharp] = useState(() => !preview || preview === src || lightboxImageDecoded(src));
  return (
    <>
      <img
        data-lightbox-media=""
        className={className}
        src={sharp ? src : preview ?? src}
        srcSet={sharp ? srcSet : undefined}
        sizes={sharp ? sizes : undefined}
        alt={alt}
        decoding={sharp ? 'async' : 'sync'}
        onError={event => {
          if (!sharp) setSharp(true);
          else onError?.(event);
        }}
      />
      {!sharp && (
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt=""
          aria-hidden="true"
          hidden
          onLoad={event => {
            const loaded = event.currentTarget;
            void loaded.decode().catch(() => undefined).then(() => setSharp(true));
          }}
          // A failed full size is the caller's to handle (its fallback or error
          // state); without a handler the picture tries it in place.
          onError={event => { if (onError) onError(event); else setSharp(true); }}
        />
      )}
    </>
  );
}
