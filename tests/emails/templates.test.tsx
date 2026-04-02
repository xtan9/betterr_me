import { describe, it, expect } from 'vitest';
import { render } from '@react-email/components';
import { EventReminderEmail } from '@/emails/event-reminder';
import { TaskDueEmail } from '@/emails/task-due';
import { HabitNudgeEmail } from '@/emails/habit-nudge';
import { BillDueEmail } from '@/emails/bill-due';
import { BaseLayout } from '@/emails/components/base-layout';
import React from 'react';

const BASE_PROPS = {
  actionUrl: 'https://app.betterr.me/dashboard',
  unsubscribeUrl: 'https://app.betterr.me/api/email/unsubscribe?token=abc123',
};

describe('EventReminderEmail', () => {
  it('renders without errors with valid props', async () => {
    const html = await render(
      <EventReminderEmail
        eventTitle="Team Meeting"
        eventDate="April 2, 2026"
        eventTime="10:00 AM"
        {...BASE_PROPS}
      />
    );
    expect(html).toBeTruthy();
    expect(html).toContain('<!DOCTYPE');
  });

  it('renders event title in output', async () => {
    const html = await render(
      <EventReminderEmail
        eventTitle="Team Meeting"
        eventDate="April 2, 2026"
        eventTime="10:00 AM"
        {...BASE_PROPS}
      />
    );
    expect(html).toContain('Team Meeting');
  });

  it('renders in zh locale without errors', async () => {
    const html = await render(
      <EventReminderEmail
        eventTitle="Team Meeting"
        eventDate="2026-04-02"
        locale="zh"
        {...BASE_PROPS}
      />
    );
    expect(html).toContain('活动提醒');
  });
});

describe('TaskDueEmail', () => {
  it('renders without errors with valid props', async () => {
    const html = await render(
      <TaskDueEmail
        taskTitle="Finish Report"
        dueDate="April 3, 2026"
        {...BASE_PROPS}
      />
    );
    expect(html).toBeTruthy();
    expect(html).toContain('Finish Report');
  });
});

describe('HabitNudgeEmail', () => {
  it('renders without errors with valid props', async () => {
    const html = await render(
      <HabitNudgeEmail
        habitName="Morning Meditation"
        {...BASE_PROPS}
      />
    );
    expect(html).toBeTruthy();
    expect(html).toContain('Morning Meditation');
  });
});

describe('BillDueEmail', () => {
  it('renders without errors with valid props', async () => {
    const html = await render(
      <BillDueEmail
        billName="Electric Bill"
        amount="125.50"
        dueDate="April 5, 2026"
        {...BASE_PROPS}
      />
    );
    expect(html).toBeTruthy();
    expect(html).toContain('Electric Bill');
    expect(html).toContain('125.50');
  });
});

describe('BaseLayout', () => {
  it('renders unsubscribe link', async () => {
    const html = await render(
      <BaseLayout unsubscribeUrl="https://example.com/unsub">
        <p>Test content</p>
      </BaseLayout>
    );
    expect(html).toContain('https://example.com/unsub');
    expect(html).toContain('Unsubscribe');
  });

  it('renders BetterR.Me brand text', async () => {
    const html = await render(
      <BaseLayout unsubscribeUrl="https://example.com/unsub">
        <p>Test content</p>
      </BaseLayout>
    );
    expect(html).toContain('BetterR.Me');
  });
});
