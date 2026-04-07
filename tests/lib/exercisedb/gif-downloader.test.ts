import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUploadToStorage } = vi.hoisted(() => ({
  mockUploadToStorage: vi.fn(),
}));
vi.mock("@/lib/supabase/storage", () => ({
  uploadToStorage: mockUploadToStorage,
}));

// Mock global fetch for GIF download
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { downloadAndStoreGif } from "@/lib/exercisedb/gif-downloader";

describe("downloadAndStoreGif", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads GIF and uploads to Supabase Storage", async () => {
    const fakeGifBuffer = Buffer.from("fake-gif-data");
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeGifBuffer.buffer),
    });
    mockUploadToStorage.mockResolvedValue(
      "https://example.com/storage/v1/object/public/exercise-gifs/0025.gif"
    );

    const url = await downloadAndStoreGif("0025", "https://v2.exercisedb.io/image/0025");

    expect(mockFetch).toHaveBeenCalledWith("https://v2.exercisedb.io/image/0025");
    expect(mockUploadToStorage).toHaveBeenCalledWith(
      "exercise-gifs",
      "0025.gif",
      expect.any(Buffer),
      "image/gif"
    );
    expect(url).toBe("https://example.com/storage/v1/object/public/exercise-gifs/0025.gif");
  });

  it("returns null on download failure", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    const url = await downloadAndStoreGif("0025", "https://v2.exercisedb.io/image/0025");

    expect(url).toBeNull();
  });

  it("returns null on upload failure", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from("gif").buffer),
    });
    mockUploadToStorage.mockRejectedValue(new Error("Upload failed"));

    const url = await downloadAndStoreGif("0025", "https://v2.exercisedb.io/image/0025");

    expect(url).toBeNull();
  });
});
