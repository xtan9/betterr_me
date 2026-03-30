import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Heatmap30Day } from '@/components/habits/heatmap';
import type { HabitFrequency, HabitLog } from '@/lib/db/types';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        'title': 'Last 30 Days',
        'completed': 'Completed',
        'missed': 'Missed',
        'notScheduled': 'Not scheduled',
        'today': 'Today',
        'cannotEdit': 'Cannot edit days older than 7 days',
        'clickToToggle': 'Click to toggle',
        'days.sun': 'Sun',
        'days.mon': 'Mon',
        'days.tue': 'Tue',
        'days.wed': 'Wed',
        'days.thu': 'Thu',
        'days.fri': 'Fri',
        'days.sat': 'Sat',
        'legend.completed': 'Completed',
        'legend.missed': 'Missed',
        'legend.notScheduled': 'Not scheduled',
      };
      return messages[key] ?? key;
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

describe('Heatmap30Day', () => {
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
  };

  it('renders the heatmap title', () => {
    render(<Heatmap30Day {...defaultProps} />);
    expect(screen.getByText('Last 30 Days')).toBeInTheDocument();
  });

  it('renders day labels (Sun-Sat) by default', () => {
    render(<Heatmap30Day {...defaultProps} />);
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });

  it('renders day labels starting from Monday when weekStartDay=1', () => {
    render(<Heatmap30Day {...defaultProps} weekStartDay={1} />);
    const dayLabels = screen.getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    const labelTexts = dayLabels.map((el) => el.textContent);
    expect(labelTexts).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('renders day labels starting from Sunday when weekStartDay=0', () => {
    render(<Heatmap30Day {...defaultProps} weekStartDay={0} />);
    const dayLabels = screen.getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    const labelTexts = dayLabels.map((el) => el.textContent);
    expect(labelTexts).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });

  it('renders 30 cells', () => {
    render(<Heatmap30Day {...defaultProps} />);
    // Cells have testids like cell-2026-01-06, cell-2026-01-07, etc.
    const cells = screen.getAllByTestId(/^cell-/);
    expect(cells).toHaveLength(30);
  });

  it('renders a cell with completed status with primary background', () => {
    const logs = [makeLog('2026-02-03', true)];
    render(<Heatmap30Day {...defaultProps} logs={logs} />);
    const cell = screen.getByTestId('cell-2026-02-03');
    expect(cell).toHaveClass('bg-primary');
  });

  it('renders a cell with missed status with slate background', () => {
    render(<Heatmap30Day {...defaultProps} />);
    // 2026-02-03 is yesterday with no log → missed
    const cell = screen.getByTestId('cell-2026-02-03');
    expect(cell).toHaveClass('bg-muted');
  });

  it('renders a not_scheduled cell with dashed border', () => {
    const weekdaysFrequency: HabitFrequency = { type: 'weekdays' };
    render(<Heatmap30Day {...defaultProps} frequency={weekdaysFrequency} />);
    // 2026-02-01 is Sunday → not scheduled for weekdays
    const cell = screen.getByTestId('cell-2026-02-01');
    expect(cell).toHaveClass('border-dashed');
  });

  it('highlights today cell with a ring', () => {
    render(<Heatmap30Day {...defaultProps} />);
    const todayCell = screen.getByTestId('cell-2026-02-04');
    expect(todayCell).toHaveClass('ring-2');
    expect(todayCell).toHaveClass('ring-primary');
  });

  it('calls onToggleDate when clicking an editable cell', () => {
    const onToggle = vi.fn();
    render(<Heatmap30Day {...defaultProps} onToggleDate={onToggle} />);

    // Click on yesterday (editable)
    const cell = screen.getByTestId('cell-2026-02-03');
    fireEvent.click(cell);

    expect(onToggle).toHaveBeenCalledWith('2026-02-03');
  });

  it('calls onToggleDate when clicking today cell', () => {
    const onToggle = vi.fn();
    render(<Heatmap30Day {...defaultProps} onToggleDate={onToggle} />);

    const todayCell = screen.getByTestId('cell-2026-02-04');
    fireEvent.click(todayCell);

    expect(onToggle).toHaveBeenCalledWith('2026-02-04');
  });

  it('does not call onToggleDate when clicking a non-editable old cell', () => {
    const onToggle = vi.fn();
    render(<Heatmap30Day {...defaultProps} onToggleDate={onToggle} />);

    // Jan 20, 2026 is more than 7 days ago (15 days ago)
    const oldCell = screen.getByTestId('cell-2026-01-20');
    fireEvent.click(oldCell);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('does not call onToggleDate when clicking not_scheduled cell', () => {
    const onToggle = vi.fn();
    const weekdaysFrequency: HabitFrequency = { type: 'weekdays' };
    render(<Heatmap30Day {...defaultProps} frequency={weekdaysFrequency} onToggleDate={onToggle} />);

    // 2026-02-01 is Sunday → not scheduled
    const cell = screen.getByTestId('cell-2026-02-01');
    fireEvent.click(cell);

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders legend with all status types', () => {
    render(<Heatmap30Day {...defaultProps} />);
    expect(screen.getByTestId('legend')).toBeInTheDocument();
    expect(screen.getAllByText('Completed')).toHaveLength(1); // Just legend since tooltip isn't rendering full content
    expect(screen.getAllByText('Missed')).toHaveLength(1);
    expect(screen.getAllByText('Not scheduled')).toHaveLength(1);
  });

  it('shows loading state when isLoading is true', () => {
    render(<Heatmap30Day {...defaultProps} isLoading />);
    expect(screen.getByTestId('heatmap-loading')).toBeInTheDocument();
  });

  it('does not render cells when loading', () => {
    render(<Heatmap30Day {...defaultProps} isLoading />);
    // In loading state, no cells are rendered
    expect(screen.queryByTestId(/^cell-/)).not.toBeInTheDocument();
  });

  it('editable cells have cursor-pointer', () => {
    render(<Heatmap30Day {...defaultProps} />);
    const todayCell = screen.getByTestId('cell-2026-02-04');
    expect(todayCell).toHaveClass('cursor-pointer');
  });

  it('non-editable old cells have cursor-not-allowed', () => {
    render(<Heatmap30Day {...defaultProps} />);
    // Jan 20 is more than 7 days ago
    const oldCell = screen.getByTestId('cell-2026-01-20');
    expect(oldCell).toHaveClass('cursor-not-allowed');
  });

  it('displays the day-of-month number inside each cell', () => {
    render(<Heatmap30Day {...defaultProps} />);

    // Today is Feb 4 → should show "4"
    const todayCell = screen.getByTestId('cell-2026-02-04');
    expect(todayCell).toHaveTextContent('4');

    // Jan 6 → should show "6"
    const jan6Cell = screen.getByTestId('cell-2026-01-06');
    expect(jan6Cell).toHaveTextContent('6');

    // Jan 15 → should show "15"
    const jan15Cell = screen.getByTestId('cell-2026-01-15');
    expect(jan15Cell).toHaveTextContent('15');
  });

  it('displays date numbers during loading state skeleton', () => {
    // Loading state should NOT show date numbers (it shows skeleton placeholders)
    render(<Heatmap30Day {...defaultProps} isLoading />);
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });

  it('shows date numbers with appropriate contrast for all cell states', () => {
    const logs = [{ id: 'log-1', habit_id: 'habit-1', user_id: 'user-1', logged_date: '2026-02-03', completed: true, created_at: '2026-02-03T00:00:00Z', updated_at: '2026-02-03T00:00:00Z' }];
    const weekdaysFrequency: HabitFrequency = { type: 'weekdays' };
    render(<Heatmap30Day habitId="habit-1" frequency={weekdaysFrequency} logs={logs} onToggleDate={vi.fn()} />);

    // Completed cell (Feb 3, Mon) — should have text
    const completedCell = screen.getByTestId('cell-2026-02-03');
    expect(completedCell).toHaveTextContent('3');

    // Missed cell (Feb 4, Wed, today) — should have text
    const missedCell = screen.getByTestId('cell-2026-02-04');
    expect(missedCell).toHaveTextContent('4');

    // Not scheduled cell (Feb 1, Sun) — should have text
    const notScheduledCell = screen.getByTestId('cell-2026-02-01');
    expect(notScheduledCell).toHaveTextContent('1');
  });

  it('not_scheduled cells have cursor-default', () => {
    const weekdaysFrequency: HabitFrequency = { type: 'weekdays' };
    render(<Heatmap30Day {...defaultProps} frequency={weekdaysFrequency} />);
    // 2026-02-01 is Sunday → not scheduled
    const cell = screen.getByTestId('cell-2026-02-01');
    expect(cell).toHaveClass('cursor-default');
  });

  it('aligns cells under the correct day-of-week column (weekStartDay=0, Sun start)', () => {
    // Today is Wed Feb 4 2026. 30 days = Jan 6 (Tue) to Feb 4 (Wed).
    // With weekStartDay=0 (Sun start), columns are: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
    render(<Heatmap30Day {...defaultProps} weekStartDay={0} />);

    // Get all grid rows (each row is a div with grid-cols-7)
    const rows = screen.getByTestId('heatmap-grid').children;

    // Jan 6 is Tuesday → should be in column index 2 (0-based) of its row
    // First cell is Jan 6 (Tue). Offset from Sun = (2 - 0 + 7) % 7 = 2.
    // So row 0 = [null, null, Jan6(Tue), Jan7(Wed), Jan8(Thu), Jan9(Fri), Jan10(Sat)]
    const firstRow = rows[0];
    // Column 0 and 1 should be empty divs (null cells)
    expect(firstRow.children[0]).not.toHaveAttribute('data-testid');
    expect(firstRow.children[1]).not.toHaveAttribute('data-testid');
    // Column 2 should be Jan 6
    expect(firstRow.children[2].querySelector('[data-testid="cell-2026-01-06"]')).toBeTruthy();
    // Column 6 should be Jan 10 (Sat)
    expect(firstRow.children[6].querySelector('[data-testid="cell-2026-01-10"]')).toBeTruthy();

    // Today (Feb 4, Wed) should be in column 3
    const lastRow = rows[rows.length - 1];
    expect(lastRow.children[3].querySelector('[data-testid="cell-2026-02-04"]')).toBeTruthy();
  });

  it('aligns cells under the correct day-of-week column (weekStartDay=1, Mon start)', () => {
    // Today is Wed Feb 4 2026. 30 days = Jan 6 (Tue) to Feb 4 (Wed).
    // With weekStartDay=1 (Mon start), columns are: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
    render(<Heatmap30Day {...defaultProps} weekStartDay={1} />);

    const rows = screen.getByTestId('heatmap-grid').children;

    // Jan 6 is Tuesday → offset from Mon = (2 - 1 + 7) % 7 = 1
    // Row 0 = [null, Jan6(Tue), Jan7(Wed), Jan8(Thu), Jan9(Fri), Jan10(Sat), Jan11(Sun)]
    const firstRow = rows[0];
    expect(firstRow.children[0]).not.toHaveAttribute('data-testid');
    expect(firstRow.children[1].querySelector('[data-testid="cell-2026-01-06"]')).toBeTruthy();
    expect(firstRow.children[6].querySelector('[data-testid="cell-2026-01-11"]')).toBeTruthy();

    // Today (Feb 4, Wed) should be in column 2 (Wed position in Mon-start grid)
    const lastRow = rows[rows.length - 1];
    expect(lastRow.children[2].querySelector('[data-testid="cell-2026-02-04"]')).toBeTruthy();
  });
});
