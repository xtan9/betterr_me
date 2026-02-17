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

  it('renders day labels (Sun-Sat)', () => {
    render(<Heatmap30Day {...defaultProps} />);
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
    expect(screen.getByText('Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu')).toBeInTheDocument();
    expect(screen.getByText('Fri')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
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
    expect(cell).toHaveClass('bg-slate-200');
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

  it('not_scheduled cells have cursor-default', () => {
    const weekdaysFrequency: HabitFrequency = { type: 'weekdays' };
    render(<Heatmap30Day {...defaultProps} frequency={weekdaysFrequency} />);
    // 2026-02-01 is Sunday → not scheduled
    const cell = screen.getByTestId('cell-2026-02-01');
    expect(cell).toHaveClass('cursor-default');
  });
});
