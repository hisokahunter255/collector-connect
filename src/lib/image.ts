const MAX_DIMENSION = 1800;
const TARGET_MAX_BYTES = 900 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/**
 * Compresses a receipt photo while keeping numbers/text readable.
 * Large phone photos are resized down to 1800px on the long edge and
 * re-encoded as JPEG with a quality search until under ~900KB.
 */
export async function compressReceipt(file: File): Promise<File> {
  if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
    throw new Error("صيغة الصورة غير مدعومة. المسموح: JPG, JPEG, PNG, WEBP");
  }
  if (file.size <= 250 * 1024) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let quality = 0.92;
  let blob = await toBlob(canvas, quality);
  while (blob && blob.size > TARGET_MAX_BYTES && quality > 0.55) {
    quality -= 0.1;
    blob = await toBlob(canvas, quality);
  }
  if (!blob || blob.size >= file.size) return file;

  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}
