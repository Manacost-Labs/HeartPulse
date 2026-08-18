import { singleLineDisplay } from './diagnostic-text-policy.mjs';

export function formatModuleBoundaryReport(report) {
  const { counts } = report;
  const lines = [
    `[module-boundaries] ${counts.modules} modules, ${counts.migrationAreas || 0} migration areas, ${counts.sources || 0} graph sources, ${counts.ownershipSources || 0} owned sources, ${counts.edges} resolved edges`,
    `[module-boundaries] migration coverage: orphaned=${counts.orphanedMigrationSource || 0}, overlapping=${counts.overlappingMigrationSource || 0}`,
    `[module-boundaries] exceptions: missing-public=${counts.missingPublicEntry}, internal=${counts.internalImport}, module-legacy=${counts.moduleLegacyImport}, runtime-crossing=${counts.runtimeCrossing}, type-cycles=${counts.typeCycle}`,
    `[module-boundaries] runtime cycles: ${counts.runtimeCycle}`,
  ];
  for (const error of report.errors) {
    const subject = error.violation || error.edge || error.exception;
    const detail = subject?.source && subject?.target
      ? `: ${subject.source} -> ${subject.target}${subject.kind ? ` (${subject.kind})` : ''}`
      : error.cycle?.nodes?.length
        ? `: ${error.cycle.nodes.join(' -> ')}`
        : '';
    lines.push(`  [${singleLineDisplay(error.code)}] ${singleLineDisplay(error.message)}${singleLineDisplay(detail)}`);
  }
  lines.push(report.ok ? '[module-boundaries] dependency contract passed' : '[module-boundaries] dependency contract failed');
  return lines.join('\n');
}
