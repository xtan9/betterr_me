import type { Metadata } from "next";
import { WorkoutLogger } from "@/components/fitness/workout-logger/workout-logger";

export const metadata: Metadata = {
  title: "Active Workout",
};

export default function ActiveWorkoutPage() {
  return <WorkoutLogger />;
}
