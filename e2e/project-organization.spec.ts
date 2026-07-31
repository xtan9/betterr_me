import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';
import { E2E_READ_ONLY, FIXTURE_REGISTRY, RUN_CONTEXT } from './constants';
import { registerFixtureId } from './run-context';

test.skip(E2E_READ_ONLY, 'Project organization requires disposable E2E state');

type ProjectFixture = {
  id: string;
  name: string;
  section: 'work';
};

type TaskFixture = {
  id: string;
  title: string;
  project_id: string | null;
  section: 'work';
  status: 'backlog' | 'todo' | 'in_progress' | 'done';
};

async function expectCreated<T>(response: APIResponse, key: string): Promise<T> {
  const body = await response.json() as Record<string, T>;
  expect(response.status(), JSON.stringify(body)).toBe(201);
  return body[key];
}

async function readTask(request: APIRequestContext, taskId: string): Promise<TaskFixture> {
  const response = await request.get(`/api/tasks/${taskId}`);
  const body = await response.json() as { task: TaskFixture };
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  return body.task;
}

function kanbanColumn(page: Page, name: 'To Do' | 'In Progress') {
  return page.getByRole('heading', { name }).locator('../..');
}

test('moves a run-owned task, persists its placement, and preserves it after project deletion', async ({ page }) => {
  const projectName = RUN_CONTEXT.ownedName('Kanban deletion project');
  const taskTitle = RUN_CONTEXT.ownedName('Kanban movable task');
  let project: ProjectFixture | undefined;
  let task: TaskFixture | undefined;

  try {
    project = await expectCreated<ProjectFixture>(
      await page.request.post('/api/projects', {
        data: { name: projectName, section: 'work', color: 'blue' },
      }),
      'project',
    );

    task = await expectCreated<TaskFixture>(
      await page.request.post('/api/tasks', {
        data: {
          title: taskTitle,
          section: 'work',
          project_id: project.id,
          status: 'todo',
        },
      }),
      'task',
    );
    registerFixtureId(FIXTURE_REGISTRY, 'tasks', task.id);

    await page.goto(`/projects/${project.id}/kanban`);
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

    const todoColumn = kanbanColumn(page, 'To Do');
    const inProgressColumn = kanbanColumn(page, 'In Progress');
    await todoColumn.getByText(taskTitle, { exact: true }).dragTo(inProgressColumn);

    await expect(inProgressColumn.getByText(taskTitle, { exact: true })).toBeVisible();
    await expect.poll(async () => (await readTask(page.request, task!.id)).status).toBe('in_progress');

    await page.reload();
    await expect(inProgressColumn.getByText(taskTitle, { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Back to Tasks' }).click();
    await expect(page).toHaveURL(/\/tasks$/);

    const projectHeader = page.getByRole('heading', { name: projectName }).locator('..');
    await projectHeader.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();

    const deleteDialog = page.getByRole('alertdialog');
    await expect(deleteDialog).toContainText(
      'Tasks in this project will become standalone tasks in the same section.',
    );
    await deleteDialog.getByRole('button', { name: 'Delete Project' }).click();

    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByRole('heading', { name: projectName })).toHaveCount(0);
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();

    const projectRead = await page.request.get(`/api/projects/${project.id}`);
    expect(projectRead.status()).toBe(404);
    const standaloneTask = await readTask(page.request, task.id);
    expect(standaloneTask).toMatchObject({
      project_id: null,
      section: 'work',
      status: 'in_progress',
    });
  } finally {
    const cleanupResponses = await Promise.all([
      task ? page.request.delete(`/api/tasks/${task.id}`) : undefined,
      project ? page.request.delete(`/api/projects/${project.id}`) : undefined,
    ]);
    for (const response of cleanupResponses) {
      if (response) expect(response.ok(), await response.text()).toBe(true);
    }
  }
});
