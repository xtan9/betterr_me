import { describe, it, expect, vi, beforeEach } from "vitest";
import { addLink, removeLink } from "@/lib/hooks/use-journal-links";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("addLink", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends POST to correct URL with link data", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await addLink("entry-123", "habit", "habit-456");

    expect(mockFetch).toHaveBeenCalledWith("/api/journal/entry-123/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link_type: "habit", link_id: "habit-456" }),
    });
  });

  it("sends correct body for task link", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await addLink("entry-123", "task", "task-789");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ link_type: "task", link_id: "task-789" });
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(addLink("entry-123", "habit", "habit-456")).rejects.toThrow(
      "Failed to add link",
    );
  });

  it("resolves without error on success", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await expect(
      addLink("entry-123", "project", "proj-111"),
    ).resolves.toBeUndefined();
  });
});

describe("removeLink", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("sends DELETE to correct URL with link_id param", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await removeLink("entry-123", "link-456");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/journal/entry-123/links?link_id=link-456",
      { method: "DELETE" },
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(removeLink("entry-123", "link-456")).rejects.toThrow(
      "Failed to remove link",
    );
  });

  it("resolves without error on success", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await expect(
      removeLink("entry-123", "link-456"),
    ).resolves.toBeUndefined();
  });
});
