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

async function expectProjectCleanup(response: APIResponse): Promise<void> {
  const body = await response.text();
  if (response.status() === 404) {
    expect(JSON.parse(body)).toEqual({ error: 'Project not found' });
    return;
  }

  expect(response.ok(), body).toBe(true);
}

function kanbanColumn(page: Page, name: 'To Do' | 'In Progress') {
  return page.getByRole('heading', { name }).locator('../..');
}

async function moveTaskToInProgress(page: Page, taskTitle: string) {
  const source = kanbanColumn(page, 'To Do').getByRole('button', {
    name: taskTitle,
    exact: true,
  });
  const destination = kanbanColumn(page, 'In Progress');
  const sourceBox = await source.boundingBox();
  const destinationBox = await destination.boundingBox();
  if (!sourceBox || !destinationBox) {
    throw new Error('Kanban drag requires visible source and destination bounds');
  }

  const sourcePoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const destinationPoint = {
    x: destinationBox.x + destinationBox.width / 2,
    y: destinationBox.y + 100,
  };

  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  try {
    await page.mouse.move(sourcePoint.x + 12, sourcePoint.y, { steps: 3 });
    await page.mouse.move(destinationPoint.x, destinationPoint.y, { steps: 20 });
    await expect(page.getByRole('status')).toContainText('in_progress');
  } finally {
    await page.mouse.up();
  }
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

    const inProgressColumn = kanbanColumn(page, 'In Progress');
    await moveTaskToInProgress(page, taskTitle);

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
    const [taskCleanupResponse, projectCleanupResponse] = await Promise.all([
      task ? page.request.delete(`/api/tasks/${task.id}`) : undefined,
      project ? page.request.delete(`/api/projects/${project.id}`) : undefined,
    ]);
    if (taskCleanupResponse) {
      expect(taskCleanupResponse.ok(), await taskCleanupResponse.text()).toBe(true);
    }
    if (projectCleanupResponse) await expectProjectCleanup(projectCleanupResponse);
  }
});
