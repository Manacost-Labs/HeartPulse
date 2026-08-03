export type DeckImageLoadState = {
  error: string;
  fullImageUrl: string;
  imageRetryAttempt: number;
  imageReady: boolean;
  previewImageUrl: string;
};

export const MAX_IMAGE_LOAD_RETRIES = 2;

const TERMINAL_IMAGE_ERROR = 'Не удалось загрузить готовое изображение колоды';

export function settleExhaustedImageLoad<T extends DeckImageLoadState>(current: T): T {
  if (current.fullImageUrl && current.previewImageUrl !== current.fullImageUrl) {
    return {
      ...current,
      error: '',
      imageReady: false,
      imageRetryAttempt: 0,
      previewImageUrl: current.fullImageUrl,
    };
  }

  return {
    ...current,
    error: TERMINAL_IMAGE_ERROR,
    imageReady: false,
    // Keep the terminal attempt stable. Resetting it would change the image
    // URL and make the browser start the preview/full retry cycle again.
    imageRetryAttempt: MAX_IMAGE_LOAD_RETRIES,
  };
}
