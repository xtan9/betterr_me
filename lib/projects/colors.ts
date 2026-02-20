export interface ProjectColor {
  key: string;
  label: string;
  hsl: string;
  hslDark: string;
}

export const PROJECT_COLORS: ProjectColor[] = [
  { key: 'blue', label: 'Blue', hsl: 'hsl(217, 91%, 60%)', hslDark: 'hsl(217, 91%, 70%)' },
  { key: 'red', label: 'Red', hsl: 'hsl(0, 84%, 60%)', hslDark: 'hsl(0, 84%, 70%)' },
  { key: 'green', label: 'Green', hsl: 'hsl(142, 71%, 45%)', hslDark: 'hsl(142, 71%, 55%)' },
  { key: 'orange', label: 'Orange', hsl: 'hsl(25, 95%, 53%)', hslDark: 'hsl(25, 95%, 63%)' },
  { key: 'purple', label: 'Purple', hsl: 'hsl(262, 83%, 58%)', hslDark: 'hsl(262, 83%, 68%)' },
  { key: 'pink', label: 'Pink', hsl: 'hsl(330, 81%, 60%)', hslDark: 'hsl(330, 81%, 70%)' },
  { key: 'teal', label: 'Teal', hsl: 'hsl(173, 80%, 40%)', hslDark: 'hsl(173, 80%, 50%)' },
  { key: 'yellow', label: 'Yellow', hsl: 'hsl(45, 93%, 47%)', hslDark: 'hsl(45, 93%, 57%)' },
  { key: 'indigo', label: 'Indigo', hsl: 'hsl(239, 84%, 67%)', hslDark: 'hsl(239, 84%, 77%)' },
  { key: 'cyan', label: 'Cyan', hsl: 'hsl(188, 86%, 53%)', hslDark: 'hsl(188, 86%, 63%)' },
  { key: 'slate', label: 'Slate', hsl: 'hsl(215, 16%, 47%)', hslDark: 'hsl(215, 16%, 57%)' },
  { key: 'emerald', label: 'Emerald', hsl: 'hsl(160, 84%, 39%)', hslDark: 'hsl(160, 84%, 49%)' },
];

/**
 * Get a ProjectColor by key. Falls back to the first color (blue) if key not found.
 */
export function getProjectColor(key: string): ProjectColor {
  return PROJECT_COLORS.find((c) => c.key === key) ?? PROJECT_COLORS[0];
}
