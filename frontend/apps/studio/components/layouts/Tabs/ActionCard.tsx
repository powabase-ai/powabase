import { Badge, Card } from 'ui'

export const ActionCard = ({
  icon,
  title,
  description,
  bgColor,
  isBeta,
  onClick,
  // data-* rest props land on the Card root (a real, box-generating element) —
  // this is what lets callers spread `onboardingAnchor(...)` attributes onto a
  // card so guide bubbles can target it (e.g. NewTab's "Create a table").
  // Deliberately narrowed to data-* keys so excess-property checking still
  // catches typos in the ordinary props.
  ...rest
}: {
  icon: JSX.Element
  title: string
  description: string
  bgColor: string
  isBeta?: boolean
  onClick?: () => void
} & { [key: `data-${string}`]: string }) => {
  return (
    <Card
      className="grow bg-surface-100 p-3 transition-colors hover:bg-surface-200 border border-light hover:border-default cursor-pointer"
      onClick={onClick}
      {...rest}
    >
      <div className={`relative flex items-start gap-3`}>
        {isBeta && (
          <Badge className="absolute -right-5 -top-5 bg-surface-300 bg-opacity-100 text-xs text-foreground">
            Coming soon
          </Badge>
        )}
        <div
          className={`rounded-full ${bgColor} w-8 h-8 flex items-center justify-center flex-shrink-0`}
        >
          {icon}
        </div>
        <div className="flex flex-col gap-0">
          <h3 className="text-sm text-foreground mb-0">{title}</h3>
          <p className="text-xs text-foreground-light">{description}</p>
        </div>
      </div>
    </Card>
  )
}
