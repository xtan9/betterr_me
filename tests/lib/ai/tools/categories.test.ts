import { describe, it, expect, vi, beforeEach } from "vitest";
import { categoryTools } from "@/lib/ai/tools/categories";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetUserCategories = vi.fn();
const mockCreateCategory = vi.fn();

vi.mock("@/lib/db", () => ({
  CategoriesDB: class {
    getUserCategories = mockGetUserCategories;
    createCategory = mockCreateCategory;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return categoryTools().find((t) => t.name === name)!;
}

describe("categoryTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 2 tool definitions", () => {
    const tools = categoryTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual([
      "getCategories",
      "createCategory",
    ]);
  });

  it("getCategories calls CategoriesDB.getUserCategories", async () => {
    const ctx = makeCtx();
    mockGetUserCategories.mockResolvedValue([{ id: "c1", name: "Health" }]);
    const result = await findTool("getCategories").execute({}, ctx);
    expect(mockGetUserCategories).toHaveBeenCalledWith("user-123");
    expect(result).toEqual([{ id: "c1", name: "Health" }]);
  });

  it("createCategory calls CategoriesDB.createCategory", async () => {
    const ctx = makeCtx();
    mockCreateCategory.mockResolvedValue({ id: "c2", name: "Fitness" });
    const result = await findTool("createCategory").execute(
      { name: "Fitness", color: "#EF4444" },
      ctx,
    );
    expect(mockCreateCategory).toHaveBeenCalledWith({
      user_id: "user-123",
      name: "Fitness",
      color: "#EF4444",
      icon: null,
      sort_order: 0,
    });
    expect(result).toEqual({ id: "c2", name: "Fitness" });
  });
});
