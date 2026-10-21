'use client';

import type { ReactNode } from 'react';

interface ChartDataTableProps {
  caption: ReactNode;
  columns: ReactNode[];
  rows: ReactNode[][];
}

/** Visually hidden table: the accessible equivalent of a chart's hover tooltips. */
export function ChartDataTable({ caption, columns, rows }: ChartDataTableProps) {
  // The wrapper does the hiding: tables ignore width/overflow, so a hidden table would still widen the page.
  return (
    <div className="ui-sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((col, i) =>
              // An unlabeled corner (row headers below, column headers beside) is a plain cell, not an empty header.
              col === '' ? (
                <td key={i} />
              ) : (
                <th key={i} scope="col">
                  {col}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) =>
                c === 0 ? (
                  <th key={c} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={c}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
