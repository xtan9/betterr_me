import { describe, it, expect, vi } from "vitest";

const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
    },
  })),
}));

import { uploadToStorage } from "@/lib/supabase/storage";

describe("uploadToStorage", () => {
  it("uploads buffer and returns public URL", async () => {
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.com/storage/v1/object/public/exercise-gifs/123.gif" },
    });

    const result = await uploadToStorage(
      "exercise-gifs",
      "123.gif",
      Buffer.from("fake-gif"),
      "image/gif"
    );

    expect(mockUpload).toHaveBeenCalledWith("123.gif", expect.any(Buffer), {
      contentType: "image/gif",
      upsert: true,
    });
    expect(result).toBe("https://example.com/storage/v1/object/public/exercise-gifs/123.gif");
  });

  it("throws on upload error", async () => {
    mockUpload.mockResolvedValue({ error: { message: "Bucket not found" } });

    await expect(
      uploadToStorage("exercise-gifs", "123.gif", Buffer.from("fake"), "image/gif")
    ).rejects.toThrow("Storage upload failed: Bucket not found");
  });
});
