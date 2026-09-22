export function renderCleanCodeReport(report, format = 'human') {
  if (format === 'json') return `${JSON.stringify(report, null, 2)}\n`;
  if (format === 'markdown') {
    const lines = [
      '# Clean-code report',
      '',
      `Status: **${report.status.toUpperCase()}**`,
      '',
      `Scope: \`${report.scope}\`; files: ${report.summary.files}; violations: ${report.summary.violations}; suppressed: ${report.summary.suppressed}.`,
    ];
    if (report.head) {
      lines.push('', `Git: head \`${report.head}\`; base \`${report.base ?? 'none'}\`; source \`${report.baseSource}\`; changed authored files: ${report.changedSourceFiles ?? 'full'}.`);
    }
    if (report.violations.length > 0) {
      lines.push('', '## Violations', '');
      for (const entry of report.violations) lines.push(`- \`${entry.id}\` — ${entry.message}`);
    }
    return `${lines.join('\n')}\n`;
  }
  if (format !== 'human') throw new Error(`unsupported clean-code report format: ${format}`);
  const lines = [
    `[clean-code] ${report.status.toUpperCase()} scope=${report.scope}${report.head ? ` head=${report.head} base=${report.base ?? 'none'} baseSource=${report.baseSource} changed=${report.changedSourceFiles ?? 'full'}` : ''} files=${report.summary.files} violations=${report.summary.violations} suppressed=${report.summary.suppressed}`,
  ];
  for (const entry of report.violations) lines.push(`  ${entry.id}: ${entry.message}`);
  return `${lines.join('\n')}\n`;
}
