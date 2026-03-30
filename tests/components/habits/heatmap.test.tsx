import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HabitCalendar } from '@/components/habits/heatmap';
import type { HabitFrequency, HabitLog } from '@/lib/db/types';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, string | number>) => {
      const messages: Record<string, string> = {
        'title': '{month} {year}',
        'prevMonth': 'Previous month',
        'nextMonth': 'Next month',
        'completed': 'Completed',
        'missed': 'Missed',
        'notScheduled': 'Not scheduled',
        'today': 'Today',
        'cannotEdit': 'Cannot edit days older than 7 days',
        'clickToToggle': 'Click to toggle',
        'days.sun': 'Sun', 'days.mon': 'Mon', 'days.tue': 'Tue',
        'days.wed': 'Wed', 'days.thu': 'Thu', 'days.fri': 'Fri', 'days.sat': 'Sat',
        'months.0': 'January', 'months.1': 'February', 'months.2': 'March',
        'months.3': 'April', 'months.4': 'May', 'months.5': 'June',
        'months.6': 'July', 'months.7': 'August', 'months.8': 'September',
        'months.9': 'October', 'months.10': 'November', 'months.11': 'December',
        'legend.completed': 'Completed',
        'legend.missed': 'Missed',
        'legend.notScheduled': 'Not scheduled',
      };
      let result = messages[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    };
    return t;
  },
}));

// Mock Tooltip to render simple title for testing
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-trigger">{children}</span>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('HabitCalendar', () => {
  beforeEach(() => {
    // Fix "today" to Wednesday, 2026-02-04 for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 4)); // Feb 4, 2026 (Wed)
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const dailyFrequency: HabitFrequency = { type: 'daily' };

  const makeLog = (date: string, completed: boolean): HabitLog => ({
    id: `log-${date}`,
    habit_id: 'habit-1',
    user_id: 'user-1',
    logged_date: date,
    completed,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
  });

  const defaultProps = {
    habitId: 'habit-1',
    frequency: dailyFrequency,
    logs: [] as HabitLog[],
    onToggleDate: vi.fn(),
    year: 2026,
    month: 1, // February (0-indexed)
    onMonthChange: vi.fn(),
  };

  it('renders month/year title', () => {
    render(<HabitCalendar {...defaultProps} />);
    expect(screen.getByText('February 2026')).toBeInTheDocument();
  });

  it('renders prev/next navigation buttons', () => {
    render(<HabitCalendar {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
  });

  it('calls onMonthChange with previous month when clicking prev', () => {
    const onMonthChange = vi.fn();
    render(<HabitCalendar {...defaultProps} onMonthChange={onMonthChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onMonthChange).toHaveBeenCalledWith(2026, 0); // January 2026
  });

  it('calls onMonthChange with next month when clicking next', () => {
    const onMonthChange = vi.fn();
    // Use a past month so next is not disabled
    render(<HabitCalendar {...defaultProps} year={2026} month={0} onMonthChange={onMonthChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonthChange).toHaveBeenCalledWith(2026, 1); // February 2026
  });

  it('wraps year when navigating past December', () => {
    const onMonthChange = vi.fn();
    render(<HabitCalendar {...defaultProps} year={2025} month={11} onMonthChange={onMonthChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onMonthChange).toHaveBeenCalledWith(2026, 0); // January 2026
  });

  it('wraps year when navigating before January', () => {
    const onMonthChange = vi.fn();
    render(<HabitCalendar {...defaultProps} year={2026} month={0} onMonthChange={onMonthChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onMonthChange).toHaveBeenCalledWith(2025, 11); // December 2025
  });

  it('disables prev button at January 1990', () => {
    render(<HabitCalendar {...defaultProps} year={1990} month={0} />);
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
  });

  it('disables next button when viewing current month (Feb 2026)', () => {
    render(<HabitCalendar {...defaultProps} year={2026} month={1} />);
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('does not disable next when viewing a past month', () => {
    render(<HabitCalendar {...defaultProps} year={2026} month={0} />);
    expect(screen.getByRole('button', { name: 'Next month' })).not.toBeDisabled();
  });

  it('renders 28 cells for February 2026', () => {
    render(<HabitCalendar {...defaultProps} year={2026} month={1} />);
    const cells = screen.getAllByTestId(/^cell-/);
    expect(cells).toHaveLength(28);
  });

  it('renders 31 cells for January', () => {
    render(<HabitCalendar {...defaultProps} year={2026} month={0} />);
    const cells = screen.getAllByTestId(/^cell-/);
    expect(cells).toHaveLength(31);
  });

  it('renders day labels (Sun-Sat)', () => {
    render(<HabitCalendar {...defaultProps} />);
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });

  it('renders day labels starting from Monday when weekStartDay=1', () => {
    render(<HabitCalendar {...defaultProps} weekStartDay={1} />);
    const dayLabels = screen.getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    const labelTexts = dayLabels.map((el) => el.textContent);
    expect(labelTexts).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('displays day-of-month numbers inside cells', () => {
    render(<HabitCalendar {...defaultProps} year={2026} month={1} />);

    // Feb 4 is today → should show "4"
    const todayCell = screen.getByTestId('cell-2026-02-04');
    expect(todayCell).toHaveTextContent('4');

    // Feb 1 → should show "1"
    const feb1Cell = screen.getByTestId('cell-2026-02-01');
    expect(feb1Cell).toHaveTextContent('1');

    // Feb 28 → should show "28"
    const feb28Cell = screen.getByTestId('cell-2026-02-28');
    expect(feb28Cell).toHaveTextContent('28');
  });

  it('renders completed cells with primary background', () => {
    const logs = [makeLog('2026-02-03', true)];
    render(<HabitCalendar {...defaultProps} logs={logs} />);
    const cell = screen.getByTestId('cell-2026-02-03');
    expect(cell).toHaveClass('bg-primary');
  });

  it('highlights today cell with a ring', () => {
    render(<HabitCalendar {...defaultProps} />);
    const todayCell = screen.getByTestId('cell-2026-02-04');
    expect(todayCell).toHaveClass('ring-2');
    expect(todayCell).toHaveClass('ring-primary');
  });

  it('calls onToggleDate when clicking a cell', () => {
    const onToggle = vi.fn();
    render(<HabitCalendar {...defaultProps} onToggleDate={onToggle} />);

    // Click on Feb 3 (editable)
    const cell = screen.getByTestId('cell-2026-02-03');
    fireEvent.click(cell);

    expect(onToggle).toHaveBeenCalledWith('2026-02-03');
  });

  it('does not call onToggleDate for not_scheduled cells', () => {
    const onToggle = vi.fn();
    const weekdaysFrequency: HabitFrequency = { type: 'weekdays' };
    render(<HabitCalendar {...defaultProps} frequency={weekdaysFrequency} onToggleDate={onToggle} />);

    // Feb 1, 2026 is a Sunday → not scheduled for weekdays
    const cell = screen.getByTestId('cell-2026-02-01');
    fireEvent.click(cell);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders the legend', () => {
    render(<HabitCalendar {...defaultProps} />);
    expect(screen.getByTestId('legend')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<HabitCalendar {...defaultProps} isLoading />);
    expect(screen.getByTestId('heatmap-loading')).toBeInTheDocument();
    expect(screen.queryByTestId(/^cell-/)).not.toBeInTheDocument();
  });

  it('uses state-aware text colors', () => {
    const logs = [makeLog('2026-02-03', true)];
    const weekdaysFrequency: HabitFrequency = { type: 'weekdays' };
    render(<HabitCalendar habitId="habit-1" frequency={weekdaysFrequency} logs={logs} onToggleDate={vi.fn()} year={2026} month={1} onMonthChange={vi.fn()} />);

    // Completed cell (Feb 3, Mon) — should have text with primary-foreground color
    const completedCell = screen.getByTestId('cell-2026-02-03');
    const completedSpan = completedCell.querySelector('span');
    expect(completedSpan).toHaveClass('text-primary-foreground/70');

    // Missed cell (Feb 4, Wed, today) — should have text with foreground color
    const missedCell = screen.getByTestId('cell-2026-02-04');
    const missedSpan = missedCell.querySelector('span');
    expect(missedSpan).toHaveClass('text-foreground/50');

    // Not scheduled cell (Feb 1, Sun) — should have text with muted color
    const notScheduledCell = screen.getByTestId('cell-2026-02-01');
    const notScheduledSpan = notScheduledCell.querySelector('span');
    expect(notScheduledSpan).toHaveClass('text-muted-foreground/40');
  });

  it('aligns cells correctly (weekStartDay=0)', () => {
    // Feb 2026: starts on Sunday (day 0)
    // With weekStartDay=0 (Sun start), column 0 = Sun, col 1 = Mon, ...
    render(<HabitCalendar {...defaultProps} year={2026} month={1} weekStartDay={0} />);

    const rows = screen.getByTestId('heatmap-grid').children;

    // Feb 1, 2026 is Sunday → should be in column 0 of the first row (no offset)
    const firstRow = rows[0];
    expect(firstRow.children[0].querySelector('[data-testid="cell-2026-02-01"]')).toBeTruthy();
  });

  it('aligns cells correctly (weekStartDay=1)', () => {
    // Feb 2026: starts on Sunday
    // With weekStartDay=1 (Mon start), Sunday is the last column (index 6)
    // Feb 1 (Sun) offset from Mon = (0 - 1 + 7) % 7 = 6
    render(<HabitCalendar {...defaultProps} year={2026} month={1} weekStartDay={1} />);

    const rows = screen.getByTestId('heatmap-grid').children;

    // Feb 1 (Sun) should be at column index 6 in row 0
    const firstRow = rows[0];
    expect(firstRow.children[6].querySelector('[data-testid="cell-2026-02-01"]')).toBeTruthy();

    // Columns 0–5 of the first row should be empty
    for (let i = 0; i < 6; i++) {
      expect(firstRow.children[i]).not.toHaveAttribute('data-testid');
    }
  });
});
