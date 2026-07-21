import { describe, it, expect } from 'vitest';
import { formatBillingAmount, millicentsToUsd } from '../billing-units';

describe('millicentsToUsd', () => {
  it('converts 100_000 millicents to $1', () => {
    expect(millicentsToUsd(100_000)).toBe(1);
  });

  it('handles zero', () => {
    expect(millicentsToUsd(0)).toBe(0);
  });

  it('handles negative', () => {
    expect(millicentsToUsd(-500_000)).toBe(-5);
  });
});

describe('formatBillingAmount', () => {
  it('formats zero as $0.00', () => {
    expect(formatBillingAmount(0)).toBe('$0.00');
  });

  it('formats whole dollars as $X.XX', () => {
    expect(formatBillingAmount(500_000)).toBe('$5.00');
  });

  it('formats cents-precision values to 2 decimals', () => {
    expect(formatBillingAmount(150_000)).toBe('$1.50');
  });

  it('formats sub-cent values to 4 decimals', () => {
    expect(formatBillingAmount(420)).toBe('$0.0042');
  });

  it('formats values below 0.0001 as <$0.0001', () => {
    expect(formatBillingAmount(5)).toBe('<$0.0001');
  });

  it('handles negative values with leading minus', () => {
    expect(formatBillingAmount(-150_000)).toBe('-$1.50');
    expect(formatBillingAmount(-420)).toBe('-$0.0042');
    expect(formatBillingAmount(-5)).toBe('-<$0.0001');
  });
});
