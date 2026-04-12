export class HabitNotFoundError extends Error {
  constructor(habitId: string) {
    super(`Habit not found: ${habitId}`);
    this.name = "HabitNotFoundError";
  }
}

export class HabitNotFormedError extends Error {
  constructor(habitId: string) {
    super(`Habit is not formed: ${habitId}`);
    this.name = "HabitNotFormedError";
  }
}

export class HabitAlreadyFormedError extends Error {
  constructor(habitId: string) {
    super(`Habit is already formed: ${habitId}`);
    this.name = "HabitAlreadyFormedError";
  }
}
