export type ComputeTierId = 'nano' | 'micro' | 'small' | 'medium' | 'large'
export type PlanTierId = 'free' | 'self-serve' | 'scale'

export interface ComputeTier {
  id: ComputeTierId
  displayName: string
  vcpu: string
  ram: string
  egressGb: number
  sandboxSubsidy: boolean
  // Marketing/value-prop fields — mirror the public pricing page
  // (https://powabase.ai/pricing). `tagline` is the one-line "best for",
  // and the bundled-resource numbers drive the per-tier detail list.
  tagline: string
  ebsGb: number
  s3Gb: number
  includedMau: number
}

// Mirrors platform.compute_sizes seed (migration 0019). The BE GET
// /compute-sizes is the live source; this static table drives instant
// display of resource specs + marketing copy without a round-trip. Per-plan
// PRICE is intentionally NOT here — COGS/margin never reach the browser, so
// pricing is read from useComputeSizesQuery's server-computed
// `prices_by_plan` instead (see ComputeTierCard / ComputePricingPanel).
export const COMPUTE_TIERS: ComputeTier[] = [
  { id: 'nano',   displayName: 'Sandbox',  vcpu: '1',    ram: '1.5 GiB',  egressGb: 5,   sandboxSubsidy: false, tagline: 'Sandbox runs pay-as-you-go from your wallet. Your $10 sign-up credit covers ~12 days of continuous use.', ebsGb: 2,  s3Gb: 1,  includedMau: 50000 },
  { id: 'micro',  displayName: 'Builder',  vcpu: '1.5',  ram: '2.5 GiB',  egressGb: 20,  sandboxSubsidy: false, tagline: "A solo dev's first agentic feature",     ebsGb: 8,  s3Gb: 5,  includedMau: 50000 },
  { id: 'small',  displayName: 'Workshop', vcpu: '2.5',  ram: '5.5 GiB',  egressGb: 40,  sandboxSubsidy: false, tagline: "A team's first deployed AI app",        ebsGb: 8,  s3Gb: 10, includedMau: 100000 },
  { id: 'medium', displayName: 'Studio',   vcpu: '5.5',  ram: '12.5 GiB', egressGb: 100, sandboxSubsidy: false, tagline: 'Multi-agent production workloads',       ebsGb: 20, s3Gb: 30, includedMau: 100000 },
  { id: 'large',  displayName: 'Foundry',  vcpu: '11',   ram: '17 GiB',   egressGb: 200, sandboxSubsidy: false, tagline: 'Dedicated QoS for high-throughput orchestrations', ebsGb: 50, s3Gb: 75, includedMau: 100000 },
]
