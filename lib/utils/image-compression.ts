import imageCompression from "browser-image-compression";

export async function compressImage(file: File | Blob): Promise<Blob> {
  const f = file instanceof File ? file : new File([file], "photo.jpg", { type: "image/jpeg" });
  const compressed = await imageCompression(f, {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.85,
  });
  return compressed;
}
