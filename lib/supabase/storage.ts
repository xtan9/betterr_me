import { createAdminClient } from "@/lib/supabase/admin";

export async function uploadToStorage(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(bucket).upload(path, data, {
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`, { cause: error });
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}
