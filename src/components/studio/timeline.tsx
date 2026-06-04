"use client"

import { useStudioStore } from "@/store"
import { Play, Pause, SkipBack, SkipForward, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"

export function StudioTimeline() {
  const { isPlaying, setPlaying, elements } = useStudioStore()
  const maxDuration = Math.max(...elements.map((el) => el.duration || 0), 5)

  return (
    <div className="h-20 border-t border-border bg-card/30 flex items-center px-4 gap-4 shrink-0">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <SkipBack className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <SkipForward className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 flex items-center gap-1">
        {elements.map((el, i) => {
          const width = maxDuration > 0 ? (el.duration / maxDuration) * 100 : 10
          return (
            <div
              key={el.id}
              className="h-6 rounded bg-primary/20 border border-primary/30 relative group cursor-pointer hover:bg-primary/30 transition-colors"
              style={{ width: `${Math.max(width, 5)}%` }}
              title={`${el.name}: ${el.duration}s`}
            >
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-primary truncate px-1">
                {el.name}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>00:00 / {maxDuration.toFixed(1)}s</span>
      </div>
    </div>
  )
}
