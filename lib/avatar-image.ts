import type { Area } from 'react-easy-crop';

export const AVATAR_OUTPUT_SIZE = 400;
export const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Failed to load image')));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

export const getCroppedAvatarDataUrl = async (
  imageSrc: string,
  pixelCrop: Area,
  outputSize = AVATAR_OUTPUT_SIZE
): Promise<string> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas is not supported in this browser.');
  }

  canvas.width = outputSize;
  canvas.height = outputSize;

  context.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize
  );

  return canvas.toDataURL('image/jpeg', 0.88);
};
