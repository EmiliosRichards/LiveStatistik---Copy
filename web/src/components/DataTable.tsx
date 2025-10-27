'use client'

import { Fragment, ReactNode } from 'react'
import { tableBase, theadBase, tbodyBase, thBase, tdBase, trBase, containerBase } from './DataTable'

export interface DataTableColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  width?: string
  render?: (value: any, row: any, index: number) => ReactNode
  className?: string
}

export interface DataTableProps {
  columns: DataTableColumn[]
  data: any[]
  rowKey?: string | ((row: any, index: number) => string)
  emptyMessage?: string
  onRowClick?: (row: any, index: number) => void
  expandedRowRender?: (row: any, index: number) => ReactNode
  expandedRowKey?: string | null
  className?: string
  containerClassName?: string
}

export function DataTable({
  columns,
  data,
  rowKey = 'id',
  emptyMessage = 'No data available',
  onRowClick,
  expandedRowRender,
  expandedRowKey,
  className = '',
  containerClassName = ''
}: DataTableProps) {
  const getRowKey = (row: any, index: number): string => {
    if (typeof rowKey === 'function') {
      return rowKey(row, index)
    }
    return row[rowKey] || String(index)
  }

  const getAlignClass = (align?: 'left' | 'right' | 'center') => {
    switch (align) {
      case 'left': return 'text-left'
      case 'right': return 'text-right'
      case 'center': return 'text-center'
      default: return 'text-left'
    }
  }

  return (
    <div className={`${containerBase} ${containerClassName}`}>
      <table className={`${tableBase} ${className}`}>
        {columns.some(col => col.width) && (
          <colgroup>
            {columns.map((col, i) => (
              <col key={i} style={col.width ? { width: col.width } : undefined} />
            ))}
          </colgroup>
        )}
        <thead className={theadBase}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${thBase} ${getAlignClass(col.align)} ${col.className || ''}`}
                title={col.label}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={tbodyBase}>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-8 text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => {
              const key = getRowKey(row, index)
              const isExpanded = expandedRowKey === key
              
              return (
                <Fragment key={key}>
                  <tr
                    className={`${trBase} ${onRowClick ? 'cursor-pointer' : ''}`}
                    onClick={() => onRowClick?.(row, index)}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`${tdBase} ${getAlignClass(col.align)} ${col.className || ''}`}
                      >
                        {col.render ? col.render(row[col.key], row, index) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                  {expandedRowRender && isExpanded && (
                    <tr key={`${key}-expanded`}>
                      <td colSpan={columns.length} className="px-0">
                        {expandedRowRender(row, index)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
