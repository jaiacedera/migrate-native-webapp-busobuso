export type CloudinaryUploadResult = {
  url: string;
  publicId: string;
};

export const MAX_CLOUDINARY_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_CLOUDINARY_IMAGE_SIZE_MB = Math.round(
  MAX_CLOUDINARY_IMAGE_SIZE_BYTES / (1024 * 1024)
);

type CloudinaryUploadOptions = {
  folder?: string;
  uploadPreset?: string;
  fileName?: string;
};

const CLOUDINARY_UPLOAD_TIMEOUT_MS = 20_000;
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim() || '';
const DEFAULT_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim() || '';
const DEFAULT_FOLDER = import.meta.env.VITE_CLOUDINARY_FOLDER?.trim() || '';
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);

const hasAllowedImageExtension = (fileName: string): boolean => {
  const normalizedName = fileName.trim().toLowerCase();
  return Array.from(ALLOWED_IMAGE_EXTENSIONS).some((extension) =>
    normalizedName.endsWith(extension)
  );
};

export function validateImageUploadFile(file: File): void {
  if (!(file instanceof File)) {
    throw new Error('Please choose a valid image file.');
  }

  if (file.size <= 0) {
    throw new Error('The selected image is empty. Please choose another file.');
  }

  const hasAllowedType = file.type ? ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase()) : false;
  if (!hasAllowedType && !hasAllowedImageExtension(file.name)) {
    throw new Error('Only JPG, PNG, WEBP, or HEIC images can be uploaded.');
  }

  if (file.size > MAX_CLOUDINARY_IMAGE_SIZE_BYTES) {
    throw new Error(`Images must be ${MAX_CLOUDINARY_IMAGE_SIZE_MB} MB or smaller.`);
  }
}

export async function uploadImageToCloudinary(
  file: File,
  options: CloudinaryUploadOptions = {}
): Promise<CloudinaryUploadResult> {
  validateImageUploadFile(file);

  const cloudName = CLOUDINARY_CLOUD_NAME;
  const uploadPreset = options.uploadPreset?.trim() || DEFAULT_UPLOAD_PRESET;
  const folder = options.folder?.trim() || DEFAULT_FOLDER;

  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary upload is not configured for the web app. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.'
    );
  }

  const formData = new FormData();
  formData.append('file', file, options.fileName || file.name);
  formData.append('upload_preset', uploadPreset);

  if (folder) {
    formData.append('folder', folder);
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CLOUDINARY_UPLOAD_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The image upload took too long. Please try again.');
    }

    throw new Error('Unable to reach the image upload service right now.');
  } finally {
    window.clearTimeout(timeoutId);
  }

  const result = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    error?: {
      message?: string;
    };
  };

  if (!response.ok || !result.secure_url || !result.public_id) {
    throw new Error(result.error?.message || 'Cloudinary upload failed');
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}
