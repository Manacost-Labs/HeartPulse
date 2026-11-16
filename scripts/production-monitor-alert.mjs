#!/usr/bin/env node
// Turns the production monitor result into ONE GitHub issue per outage:
//   red, no open alert        -> open the issue
//   red, set of failures new  -> one comment, fingerprint updated
//   red, same failures        -> nothing (no duplicates, no noise)
//   green, open alert         -> recovery comment, issue closed
// Runs in .github/workflows/production-monitor.yml with GITHUB_TOKEN; the
// only external call is the `gh` CLI. Warnings never open an issue.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ALERT_MARKER = '<!-- production-monitor-alert -->';
export const ALERT_LABELS = ['type:bug', 'source:qa', 'agent-team'];
const FINGERPRINT_PATTERN = /<!-- fingerprint:([a-f0-9]{12}) -->/;
const MAX_LISTED_FAILURES = 40;

export function failureFingerprint(failures) {
  const labels = [...new Set(failures.map(failure => failure.label))].sort();
  return createHash('sha256').update(labels.join('\n')).digest('hex').slice(0, 12);
}

function inlineCode(value) {
  return `\`${String(value).replace(/[`\r\n]+/g, ' ')}\``;
}

function failureLines(failures) {
  const lines = failures.slice(0, MAX_LISTED_FAILURES)
    .map(failure => `- ${inlineCode(failure.label)}: ${inlineCode(failure.message)}`);
  if (failures.length > MAX_LISTED_FAILURES) lines.push(`- ... и ещё ${failures.length - MAX_LISTED_FAILURES}`);
  return lines.join('\n');
}

export function readMonitorReport(file, outcome) {
  if (file && existsSync(file)) {
    try {
      const report = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(report?.failures)) return report;
    } catch {
      // fall through to the synthetic report
    }
  }
  if (outcome === 'success') return { status: 'ok', failures: [], warnings: [] };
  return {
    status: 'error',
    failures: [{ label: 'monitor', message: 'монитор не оставил отчёт (упал до конца прогона)' }],
    warnings: [],
  };
}

export function planAlert({ outcome, report, openIssue, runUrl, checkedAt }) {
  const failed = outcome !== 'success' || report.status !== 'ok' || report.failures.length > 0;
  const failures = failed && report.failures.length > 0
    ? report.failures
    : [{ label: 'monitor', message: 'прогон упал без описания сбоя' }];
  if (!failed) {
    if (!openIssue) return { type: 'noop' };
    return {
      type: 'recover',
      comment: `Монитор снова зелёный (${checkedAt || 'сейчас'}): ${runUrl}\n\nПроблема закрыта автоматически; новый сбой откроет новый issue.\n\n— 🤖 production-monitor`,
    };
  }
  const fingerprint = failureFingerprint(failures);
  const summary = `Прогон: ${runUrl}\nВремя проверки: ${checkedAt || 'неизвестно'}\n\n${failureLines(failures)}`;
  if (!openIssue) {
    return {
      type: 'open',
      title: `[P1] Монитор прода: сбой — ${[...new Set(failures.map(failure => failure.label))].slice(0, 3).join(', ')}`,
      body: `${ALERT_MARKER}\n<!-- fingerprint:${fingerprint} -->\n## Монитор прода обнаружил сбой\n\n${summary}\n\nЭтот issue обновляется, только когда меняется набор сбоев, и закрывается сам при зелёном прогоне. Порядок действий: docs/runbooks/production-monitor.md.\n\n— 🤖 production-monitor`,
    };
  }
  if (FINGERPRINT_PATTERN.exec(openIssue.body || '')?.[1] === fingerprint) return { type: 'noop' };
  return {
    type: 'update',
    fingerprint,
    comment: `Набор сбоев изменился.\n\n${summary}\n\n— 🤖 production-monitor`,
  };
}

export function findAlertIssue(issues) {
  return issues.find(issue => (issue.body || '').includes(ALERT_MARKER)) || null;
}

export function applyAlert(plan, openIssue, gh) {
  if (plan.type === 'noop') return;
  if (plan.type === 'open') {
    gh(['issue', 'create', '--title', plan.title, '--body-file', '-',
      ...ALERT_LABELS.flatMap(label => ['--label', label])], plan.body);
    return;
  }
  const number = String(openIssue.number);
  gh(['issue', 'comment', number, '--body-file', '-'], plan.comment);
  if (plan.type === 'recover') {
    gh(['issue', 'close', number]);
  } else {
    const body = FINGERPRINT_PATTERN.test(openIssue.body || '')
      ? openIssue.body.replace(FINGERPRINT_PATTERN, `<!-- fingerprint:${plan.fingerprint} -->`)
      : `${openIssue.body || ''}\n<!-- fingerprint:${plan.fingerprint} -->`;
    gh(['issue', 'edit', number, '--body-file', '-'], body);
  }
}

function realGh(args, input) {
  return execFileSync('gh', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
}

export function runAlert({ outcome, reportFile, runUrl, summaryFile, gh = realGh }) {
  const report = readMonitorReport(reportFile, outcome);
  const issues = JSON.parse(gh([
    'issue', 'list', '--state', 'open', '--limit', '50', '--json', 'number,body',
    ...ALERT_LABELS.flatMap(label => ['--label', label]),
  ]) || '[]');
  const openIssue = findAlertIssue(issues);
  const plan = planAlert({ outcome, report, openIssue, runUrl, checkedAt: report.checkedAt });
  applyAlert(plan, openIssue, gh);
  if (summaryFile) {
    const warnings = (report.warnings || []).map(warning => `- ${warning.label}: ${warning.message}`).join('\n');
    appendFileSync(summaryFile, `### Монитор прода: ${report.status}, оповещение: ${plan.type}\n${warnings ? `\nПредупреждения:\n${warnings}\n` : ''}`);
  }
  return plan;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const plan = runAlert({
    outcome: process.env.PROBE_OUTCOME || 'failure',
    reportFile: process.env.MONITOR_REPORT_FILE,
    runUrl: `${server}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    summaryFile: process.env.GITHUB_STEP_SUMMARY,
  });
  console.log(`[production-monitor-alert] ${plan.type}`);
}
