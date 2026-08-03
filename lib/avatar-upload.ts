import api from '@/lib/api';
import { getCroppedAvatarDataUrl } from '@/lib/avatar-image';
import type { Area } from 'react-easy-crop';

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);

  if (!match) {
    throw new Error('Profile photo data is invalid. Please choose the photo again.');
  }

  const contentType = match[1] || 'image/jpeg';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType });
};

export const uploadPatientAvatar = async (croppedDataUrl: string): Promise<string> => {
  const blob = await dataUrlToBlob(croppedDataUrl);
  const contentType = blob.type || 'image/jpeg';

  const sessionResponse = await api.post('/patient/avatar/upload-session', {
    contentType,
    fileSize: blob.size,
  });

  const uploadUrl = sessionResponse.data?.data?.uploadUrl;
  const uploadToken = sessionResponse.data?.data?.uploadToken;
  const sessionContentType = sessionResponse.data?.data?.contentType || contentType;

  if (!uploadUrl || !uploadToken) {
    throw new Error('Unable to start profile photo upload.');
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': sessionContentType,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new Error('Profile photo upload failed. Please try again.');
  }

  const completeResponse = await api.post('/patient/avatar/upload-complete', {
    uploadToken,
  });

  const avatarUrl = completeResponse.data?.data?.avatar;
  if (!avatarUrl) {
    throw new Error('Profile photo upload could not be finalized.');
  }

  return avatarUrl;
};

export const cropAndUploadPatientAvatar = async (
  imageSrc: string,
  pixelCrop: Area
): Promise<string> => {
  const croppedDataUrl = await getCroppedAvatarDataUrl(imageSrc, pixelCrop);
  return uploadPatientAvatar(croppedDataUrl);
};
