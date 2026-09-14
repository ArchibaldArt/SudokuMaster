import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Board } from './Board'
import type { BoardProps } from './Board'
import { topology } from '../core/topology'

export interface BoardViewportProps extends BoardProps {
  scale: number
}

export function BoardViewport({ scale, ...props }: BoardViewportProps) {
  const geometry = useMemo(() => topology(props.puzzle), [props.puzzle])
  const overview = props.puzzle.boards && props.focusBoard == null
  return (
    <div className="grid-viewport" tabIndex={0} aria-label="Область полей">
      <div
        className="scaled-board"
        style={
          {
            minWidth: overview ? geometry.width * 30 * scale : undefined,
            '--board-scale': scale,
          } as CSSProperties
        }
      >
        <Board {...props} />
      </div>
    </div>
  )
}
