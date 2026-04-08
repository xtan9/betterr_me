import { uploadToStorage } from "@/lib/supabase/storage";
import { log } from "@/lib/logger";

const BUCKET = "exercise-gifs";

export async function downloadAndStoreGif(
  exercisedbId: string,
  gifUrl: string
): Promise<string | null> {
  try {
    const response = await fetch(gifUrl);
    if (!response.ok) {
      log.warn("GIF download failed", { exercisedbId, status: response.status });
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const storagePath = `${exercisedbId}.gif`;

    const publicUrl = await uploadToStorage(BUCKET, storagePath, buffer, "image/gif");
    return publicUrl;
  } catch (error) {
    log.error("GIF download/upload error", error, { exercisedbId });
    return null;
  }
}
