interface DetailSectionProps {
  title: string
  emptyCopy: string
  children: React.ReactNode
  itemCount: number
}

export function DetailSection({ title, emptyCopy, children, itemCount }: DetailSectionProps) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-medium mb-3">{title}</h2>
      {itemCount === 0 ? (
        <div className="text-sm text-foreground-light py-4">{emptyCopy}</div>
      ) : (
        children
      )}
    </section>
  )
}
