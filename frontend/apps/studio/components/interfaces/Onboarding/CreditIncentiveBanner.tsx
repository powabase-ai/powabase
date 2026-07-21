import { Card } from 'ui'

interface Props {
  amountUsd: number
}

export function CreditIncentiveBanner({ amountUsd }: Props) {
  return (
    <Card className="border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-sm">
        <span className="font-semibold">Earn ${amountUsd} in Powabase credits</span>
        {' — answer 5 quick questions to help us tailor your experience.'}
      </p>
    </Card>
  )
}
