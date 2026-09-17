import type { ReactNode } from 'react';

export function TableShell({ headers, children, footer }: { headers: string[]; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="bg-bg-secondary border border-border-primary rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-primary">
              {headers.map((h) => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function Empty({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-text-muted text-sm">{text}</td>
    </tr>
  );
}

