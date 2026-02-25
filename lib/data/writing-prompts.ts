export const PROMPT_CATEGORIES = ["gratitude", "reflection", "goals"] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export interface WritingPrompt {
  key: string;
  category: PromptCategory;
  i18nKey: string;
}

export const WRITING_PROMPTS: WritingPrompt[] = [
  // Gratitude
  {
    key: "gratitude-01",
    category: "gratitude",
    i18nKey: "journal.prompts.gratitude01",
  },
  {
    key: "gratitude-02",
    category: "gratitude",
    i18nKey: "journal.prompts.gratitude02",
  },
  {
    key: "gratitude-03",
    category: "gratitude",
    i18nKey: "journal.prompts.gratitude03",
  },
  {
    key: "gratitude-04",
    category: "gratitude",
    i18nKey: "journal.prompts.gratitude04",
  },
  {
    key: "gratitude-05",
    category: "gratitude",
    i18nKey: "journal.prompts.gratitude05",
  },

  // Reflection
  {
    key: "reflection-01",
    category: "reflection",
    i18nKey: "journal.prompts.reflection01",
  },
  {
    key: "reflection-02",
    category: "reflection",
    i18nKey: "journal.prompts.reflection02",
  },
  {
    key: "reflection-03",
    category: "reflection",
    i18nKey: "journal.prompts.reflection03",
  },
  {
    key: "reflection-04",
    category: "reflection",
    i18nKey: "journal.prompts.reflection04",
  },
  {
    key: "reflection-05",
    category: "reflection",
    i18nKey: "journal.prompts.reflection05",
  },

  // Goals
  {
    key: "goals-01",
    category: "goals",
    i18nKey: "journal.prompts.goals01",
  },
  {
    key: "goals-02",
    category: "goals",
    i18nKey: "journal.prompts.goals02",
  },
  {
    key: "goals-03",
    category: "goals",
    i18nKey: "journal.prompts.goals03",
  },
  {
    key: "goals-04",
    category: "goals",
    i18nKey: "journal.prompts.goals04",
  },
  {
    key: "goals-05",
    category: "goals",
    i18nKey: "journal.prompts.goals05",
  },
];

export function getPromptsByCategory(
  category: PromptCategory
): WritingPrompt[] {
  return WRITING_PROMPTS.filter((p) => p.category === category);
}

export function getPromptByKey(key: string): WritingPrompt | undefined {
  return WRITING_PROMPTS.find((p) => p.key === key);
}
