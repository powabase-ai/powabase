'use client'

import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { useWindowSize } from 'react-use'
import { CommandEmpty_Shadcn_, Sheet, SheetContent } from 'ui'
import { cn } from 'ui/src/lib/utils'

const MobileSheetNav: React.FC<{
  children: React.ReactNode
  open?: boolean
  /**
   * `userInitiated` is true only when the close came from the underlying Sheet
   * itself (backdrop tap, swipe, Escape) — never from the route-change /
   * viewport-resize auto-close effects below. Callers that need to tell a
   * genuine user dismiss apart from an internal auto-close (e.g. a persistent
   * panel that shouldn't reopen after a real dismiss, but also shouldn't be
   * torn down by an unrelated route change) can use this to distinguish them.
   */
  onOpenChange(open: boolean, userInitiated?: boolean): void
  className?: string
  shouldCloseOnRouteChange?: boolean
  shouldCloseOnViewportResize?: boolean
}> = ({
  children,
  open = false,
  onOpenChange,
  className,
  shouldCloseOnRouteChange = true,
  shouldCloseOnViewportResize = true,
}) => {
  const router = useRouter()
  const { width } = useWindowSize()

  // Use full asPath (including query) so the sheet closes when navigating to the same path with
  // different query params (e.g. Integrations submenu: All vs Wrappers vs Postgres Modules).
  const fullPath = router?.asPath ?? ''
  useEffect(() => {
    if (shouldCloseOnRouteChange) {
      onOpenChange(false)
    }
  }, [fullPath])

  useEffect(() => {
    if (shouldCloseOnViewportResize) {
      onOpenChange(false)
    }
  }, [width])

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next, true)}>
      <SheetContent
        id="mobile-sheet-content"
        aria-describedby={undefined}
        showClose={false}
        size="full"
        side="bottom"
        className={cn(
          'rounded-t-lg bg-background overflow-hidden overflow-y-scroll h-[85dvh] md:max-h-[500px]',
          className
        )}
      >
        <ErrorBoundary FallbackComponent={() => <CommandEmpty_Shadcn_ />}>{children}</ErrorBoundary>
      </SheetContent>
    </Sheet>
  )
}

export { MobileSheetNav }
export default MobileSheetNav
