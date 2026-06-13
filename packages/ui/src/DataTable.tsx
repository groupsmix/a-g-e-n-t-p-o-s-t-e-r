import type { ReactNode } from 'react'

export interface DataTableColumn<T> {
  key: string
  header: string
  render?: (row: T, index: number) => ReactNode
  className?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  getKey?: (row: T, index: number) => string | number
  emptyMessage?: string
  className?: string
}

export function DataTable<T extends Record<string, unknown>>({
  columns, rows, getKey, emptyMessage = 'No data.', className = '',
}: DataTableProps<T>) {
  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-xs font-medium text-muted-foreground ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr
                key={getKey ? getKey(row, idx) : idx}
                className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                    {col.render ? col.render(row, idx) : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
