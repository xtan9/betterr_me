import { describe, expect, it } from "vitest";
import { profileDetailsFormSchema } from "@/lib/validations/profile";

describe("profileDetailsFormSchema", () => {
  it("keeps the browser Profile Details contract in domain casing", () => {
    expect(
      profileDetailsFormSchema.safeParse({
        fullName: "John Doe",
        avatarUrl: "https://example.com/avatar.jpg",
      }).success,
    ).toBe(true);
    expect(
      profileDetailsFormSchema.safeParse({
        full_name: "John Doe",
        avatar_url: "https://example.com/avatar.jpg",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields instead of accepting a transport-shaped patch", () => {
    expect(
      profileDetailsFormSchema.safeParse({
        fullName: "John Doe",
        preferences: { theme: "dark" },
      }).success,
    ).toBe(false);
  });
});
