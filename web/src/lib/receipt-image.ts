const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export async function readFileBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  if (!base64) throw new Error('Could not read that file');
  return { base64, mimeType: file.type || 'application/octet-stream' };
}

async function canvasToJpeg(bitmap: ImageBitmap): Promise<Blob> {
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare screenshot');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('Could not prepare screenshot');
  return blob;
}

export async function prepareReceiptFile(file: File): Promise<{
  base64: string;
  mimeType: string;
  name: string;
  previewUrl: string;
}> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const { base64 } = await readFileBase64(file);
    return { base64, mimeType: 'application/pdf', name: file.name || 'receipt.pdf', previewUrl: '' };
  }
  if (!file.type.startsWith('image/') && file.type !== '') {
    throw new Error('Use a photo, screenshot, or PDF of the receipt');
  }

  try {
    const bitmap = await createImageBitmap(file);
    const jpeg = await canvasToJpeg(bitmap);
    const prepared = new File([jpeg], file.name.replace(/\.[^.]+$/, '') || 'screenshot', {
      type: 'image/jpeg',
    });
    const { base64 } = await readFileBase64(prepared);
    return {
      base64,
      mimeType: 'image/jpeg',
      name: file.name || 'screenshot.jpg',
      previewUrl: `data:image/jpeg;base64,${base64}`,
    };
  } catch {
    const { base64, mimeType } = await readFileBase64(file);
    const kind = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    return {
      base64,
      mimeType: kind,
      name: file.name || 'screenshot',
      previewUrl: `data:${kind};base64,${base64}`,
    };
  }
}

export function fileFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  if (data.files?.length) {
    const file = data.files[0];
    if (
      file &&
      (file.type.startsWith('image/') ||
        file.type === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf'))
    ) {
      return file;
    }
  }
  const items = data.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

export function isChatPasteTarget(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  return Boolean(
    el?.closest('[data-bot="cohost-panel"], [data-bot="build-panel"]'),
  );
}
