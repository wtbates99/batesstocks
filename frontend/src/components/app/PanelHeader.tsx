/**
 * PanelHeader — canonical panel title bar with optional right slot.
 */
import type { ReactNode } from 'react'

interface PanelHeaderProps {
  title: string
  right?: ReactNode
  meta?: string
}

export default function PanelHeader({ title, right, meta }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <div className="panel-title">{title}</div>
      {meta && <div className="panel-meta">{meta}</div>}
      {right && <div className="table-actions">{right}</div>}
    </div>
  )
}
