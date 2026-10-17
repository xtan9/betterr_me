import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkAssistant } from './assistant-probe.mjs';
import { reconcileAvailability } from './assistant-incidents.mjs';
import { githubIncidentStore, resendDelivery } from './assistant-alert-transports.mjs';

export async function runMonitor({ env = process.env, fetchImpl = fetch, now = () => new Date(), check = checkAssistant } = {}) {
  const mode = env.MONITOR_MODE || 'live';
  if (!['live', 'test_failure', 'test_recovery'].includes(mode)) throw new Error('invalid_mode');
  const test = mode !== 'live';
  const repo = env.GITHUB_REPOSITORY;
  const runUrl = `https://github.com/${repo}/actions/runs/${env.GITHUB_RUN_ID}`;
  const result = test ? { healthy: mode === 'test_recovery', category: mode === 'test_recovery' ? 'healthy' : 'simulated_failure', attempts: 0, durationMs: 0 }
    : await check({ appUrl: env.APP_URL, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      email: env.ASSISTANT_MONITOR_EMAIL, password: env.ASSISTANT_MONITOR_PASSWORD, expectedUserId: env.ASSISTANT_MONITOR_USER_ID, fetchImpl });
  // This marker is the freshness evidence used by the independent Codex check.
  const completedAt = now().toISOString();
  console.log(`ASSISTANT_PROBE_COMPLETED ${JSON.stringify({ mode, completedAt, ...result })}`);
  const sendEmail = resendDelivery({ key: env.RESEND_API_KEY, to: env.ASSISTANT_ALERT_EMAIL, test, fetchImpl });
  let delivery;
  try {
    const store = githubIncidentStore({ token: env.GH_TOKEN, repo, test, fetchImpl });
    delivery = await reconcileAvailability({ result, store, sendEmail, runUrl, now });
  } catch {
    // A GitHub outage must not prevent the independent email attempt. Keep the
    // fallback payload stable within a 30-minute bucket for Resend deduplication.
    const bucket = Math.floor(now().getTime() / 1_800_000);
    const at = new Date(bucket * 1_800_000).toISOString();
    delivery = { deliveryFailures: ['github_state'] };
    try {
      await sendEmail({ id: `state-${repo.replace('/', '-')}-${bucket}`, kind: 'outage', at, startedAt: at, lastSuccessAt: null,
        category: 'notification_state', httpStatus: null, durationMs: null,
        runUrl: `https://github.com/${repo}/actions/workflows/assistant-availability.yml` },
      { url: `https://github.com/${repo}/actions/workflows/assistant-availability.yml` });
    } catch { delivery.deliveryFailures.push('email'); }
  }
  const summary = { mode, completedAt, ...result, ...delivery };
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## Assistant availability\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runMonitor();
    console.log(JSON.stringify(result));
    if ((result.mode === 'live' && !result.healthy) || result.deliveryFailures.length) process.exitCode = 1;
  } catch {
    console.error('Assistant monitor could not complete; inspect configuration and monitor freshness.');
    process.exitCode = 1;
  }
}
