import React, { useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { ADMIN_INPUT } from './contestAdminUi';

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

export function firstImageFile(files: FileList | File[] | null | undefined): File | null {
  if (!files) return null;
  return Array.from(files).find(file => file.type.startsWith('image/')) ?? null;
}

async function uploadAdminImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Можно загружать только изображения');
  const dataUrl = await fileToDataUrl(file);
  const response = await fetch('/api/admin/uploads/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
    body: JSON.stringify({ dataUrl }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить картинку');
  return String(data.url || '');
}

async function uploadAdminImageUrl(sourceUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(sourceUrl.trim());
  } catch {
    throw new Error('Укажите корректную ссылку на изображение');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Ссылка должна начинаться с http:// или https://');
  const response = await fetch('/api/admin/uploads/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
    body: JSON.stringify({ sourceUrl: url.href }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить картинку по ссылке');
  return String(data.url || '');
}

type ContestAdminImageUploaderProps = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  allowExternalUrl?: boolean;
};

export function ContestAdminImageUploader({
  label,
  value,
  onChange,
  allowExternalUrl = true,
}: ContestAdminImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const uploadFile = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      onChange(await uploadAdminImageFile(file));
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить картинку');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const uploadFromUrl = async () => {
    setUploading(true);
    setError('');
    try {
      onChange(await uploadAdminImageUrl(value));
    } catch (uploadError: unknown) {
      setError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить картинку по ссылке');
    } finally {
      setUploading(false);
    }
  };

  const canImportUrl = /^https?:\/\//i.test(value.trim());

  return (
    <div
      className={`admin-image-uploader ${uploading ? 'admin-image-uploader-busy' : ''}`}
      aria-busy={uploading}
      onPaste={event => {
        const file = firstImageFile(Array.from(event.clipboardData.files));
        if (file) {
          event.preventDefault();
          void uploadFile(file);
        }
      }}
      onDragOver={event => {
        event.preventDefault();
        event.currentTarget.classList.add('admin-image-uploader-over');
      }}
      onDragLeave={event => event.currentTarget.classList.remove('admin-image-uploader-over')}
      onDrop={event => {
        event.preventDefault();
        event.currentTarget.classList.remove('admin-image-uploader-over');
        void uploadFile(firstImageFile(event.dataTransfer.files));
      }}
    >
      <div className="admin-image-uploader-head">
        <span>{label}</span>
        <div className="admin-image-uploader-actions">
          {value && <button type="button" onClick={() => onChange('')} disabled={uploading}>Убрать</button>}
          {allowExternalUrl && (
            <button type="button" onClick={() => void uploadFromUrl()} disabled={uploading || !canImportUrl}>
              Загрузить по ссылке
            </button>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Загружаем...' : 'Выбрать файл'}
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        aria-label={`Файл: ${label}`}
        onChange={event => void uploadFile(firstImageFile(event.target.files))}
      />
      {allowExternalUrl ? (
        <>
          <input aria-label={`${label}: URL`} value={value} onChange={event => { setError(''); onChange(event.target.value); }} placeholder="https://example.com/cover.jpg" style={ADMIN_INPUT} />
          <small className="admin-field-hint">Вставьте прямую ссылку и нажмите «Загрузить по ссылке». Картинка будет сохранена на нашем сервере.</small>
        </>
      ) : (
        <small className="admin-field-hint">Используйте загрузку файла: конкурс принимает только изображения, сохранённые на этом сайте.</small>
      )}
      <div className="admin-image-uploader-body">
        {value ? <img src={value} alt="" /> : <span><ImageIcon size={24} /> Вставьте картинку, перетащите сюда или загрузите с компьютера</span>}
      </div>
      {error && <small className="admin-inline-error" role="alert">{error}</small>}
    </div>
  );
}
