import { describe, it, expect, vi } from "vitest";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

// Suppress log.warn output in tests
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe("getSafeRedirectPath", () => {
  describe("null/undefined input", () => {
    it('returns "/" for null', () => {
      expect(getSafeRedirectPath(null)).toBe("/");
    });
  });

  describe("external URL blocking", () => {
    it('returns "/" for absolute URLs', () => {
      expect(getSafeRedirectPath("https://evil.com/hack")).toBe("/");
    });

    it('returns "/" for http URLs', () => {
      expect(getSafeRedirectPath("http://evil.com")).toBe("/");
    });

    it('returns "/" for protocol-relative URLs', () => {
      expect(getSafeRedirectPath("//evil.com")).toBe("/");
    });

    it('returns "/" for non-slash-starting paths', () => {
      expect(getSafeRedirectPath("evil.com")).toBe("/");
    });
  });

  describe("exact match allowlist", () => {
    it("allows /", () => {
      expect(getSafeRedirectPath("/")).toBe("/");
    });

    it("allows /dashboard", () => {
      expect(getSafeRedirectPath("/dashboard")).toBe("/dashboard");
    });

    it("allows /habits", () => {
      expect(getSafeRedirectPath("/habits")).toBe("/habits");
    });

    it("allows /tasks", () => {
      expect(getSafeRedirectPath("/tasks")).toBe("/tasks");
    });

    it("allows /dashboard/settings", () => {
      expect(getSafeRedirectPath("/dashboard/settings")).toBe(
        "/dashboard/settings",
      );
    });
  });

  describe("prefix match allowlist", () => {
    it("allows /habits/some-id", () => {
      expect(getSafeRedirectPath("/habits/some-id")).toBe("/habits/some-id");
    });

    it("allows /tasks/some-id", () => {
      expect(getSafeRedirectPath("/tasks/some-id")).toBe("/tasks/some-id");
    });

    it("allows /habits/abc/edit", () => {
      expect(getSafeRedirectPath("/habits/abc/edit")).toBe("/habits/abc/edit");
    });
  });

  describe("blocked paths", () => {
    it('returns "/" for /admin', () => {
      expect(getSafeRedirectPath("/admin")).toBe("/");
    });

    it('returns "/" for /api/internal', () => {
      expect(getSafeRedirectPath("/api/internal")).toBe("/");
    });

    it('returns "/" for /auth/login', () => {
      expect(getSafeRedirectPath("/auth/login")).toBe("/");
    });
  });

  describe("query params and hash preservation", () => {
    it("preserves query params on allowed paths", () => {
      expect(getSafeRedirectPath("/dashboard?tab=settings")).toBe(
        "/dashboard?tab=settings",
      );
    });

    it("preserves hash on allowed paths", () => {
      expect(getSafeRedirectPath("/dashboard#section")).toBe(
        "/dashboard#section",
      );
    });

    it("preserves both query and hash on allowed paths", () => {
      expect(getSafeRedirectPath("/habits?sort=name#top")).toBe(
        "/habits?sort=name#top",
      );
    });

    it("preserves query params on prefix-matched paths", () => {
      expect(getSafeRedirectPath("/habits/abc?edit=true")).toBe(
        "/habits/abc?edit=true",
      );
    });
  });
});
