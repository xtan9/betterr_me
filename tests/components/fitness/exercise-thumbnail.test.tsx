import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { ExerciseMedia } from "@/lib/db/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Import after mocks
import { ExerciseThumbnail } from "@/components/fitness/exercise-thumbnail";

const makeMedia = (
  overrides: Partial<ExerciseMedia> = {}
): ExerciseMedia => ({
  gif_url: "https://v2.exercisedb.io/image/test.gif",
  thumbnail_url: null,
  instructions: null,
  alternative_names: null,
  exercisedb_id: "0001",
  media_status: "active",
  ...overrides,
});

describe("ExerciseThumbnail", () => {
  it("renders img element with gif_url when exercise_media.gif_url is provided", () => {
    render(
      <ExerciseThumbnail
        exerciseMedia={makeMedia()}
        exerciseName="Bench Press"
      />
    );

    const img = screen.getByAltText("exerciseThumbnailAlt");
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute(
      "src",
      "https://v2.exercisedb.io/image/test.gif"
    );
  });

  it("renders Dumbbell icon fallback when exercise_media is null", () => {
    const { container } = render(
      <ExerciseThumbnail exerciseMedia={null} exerciseName="Bench Press" />
    );

    // No img element
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // Dumbbell icon rendered (lucide renders svg)
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders Dumbbell icon fallback when exercise_media.gif_url is null", () => {
    const { container } = render(
      <ExerciseThumbnail
        exerciseMedia={makeMedia({ gif_url: null })}
        exerciseName="Bench Press"
      />
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders Dumbbell icon fallback when media_status is 'broken'", () => {
    const { container } = render(
      <ExerciseThumbnail
        exerciseMedia={makeMedia({ media_status: "broken" })}
        exerciseName="Bench Press"
      />
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("applies circular crop (rounded-full class) to the container", () => {
    const { container } = render(
      <ExerciseThumbnail
        exerciseMedia={makeMedia()}
        exerciseName="Bench Press"
      />
    );

    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain("rounded-full");
  });

  it("accepts size prop with sm=32px, md=40px, lg=64px defaults", () => {
    const { container: smContainer } = render(
      <ExerciseThumbnail
        exerciseMedia={makeMedia()}
        exerciseName="Bench Press"
        size="sm"
      />
    );
    const { container: mdContainer } = render(
      <ExerciseThumbnail
        exerciseMedia={makeMedia()}
        exerciseName="Bench Press"
        size="md"
      />
    );
    const { container: lgContainer } = render(
      <ExerciseThumbnail
        exerciseMedia={makeMedia()}
        exerciseName="Bench Press"
        size="lg"
      />
    );

    // sm = h-8 w-8 (32px)
    expect(smContainer.firstElementChild?.className).toContain("h-8");
    expect(smContainer.firstElementChild?.className).toContain("w-8");

    // md = h-10 w-10 (40px)
    expect(mdContainer.firstElementChild?.className).toContain("h-10");
    expect(mdContainer.firstElementChild?.className).toContain("w-10");

    // lg = h-16 w-16 (64px)
    expect(lgContainer.firstElementChild?.className).toContain("h-16");
    expect(lgContainer.firstElementChild?.className).toContain("w-16");
  });

  it("renders alt text from exerciseName prop", () => {
    render(
      <ExerciseThumbnail
        exerciseMedia={makeMedia()}
        exerciseName="Incline Dumbbell Press"
      />
    );

    const img = screen.getByAltText("exerciseThumbnailAlt");
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe("IMG");
  });
});
