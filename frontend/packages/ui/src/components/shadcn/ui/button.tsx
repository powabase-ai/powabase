'use client'

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '../../../lib/utils/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground-muted focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-blue-300 text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-control bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        // The canonical primary-CTA fill used across Studio's project pages
        // (Create / Save / Add). Color + nowrap only here — geometry is
        // applied via compoundVariants below so it appears LAST in the cva
        // concatenation and twMerge inside cn() resolves it against the
        // size baseline that comes earlier. Icon-bearing variants (e.g.
        // dropdown triggers with Plus + ChevronDown) extend with
        // className='gap-1.5'; the inline-flex baseline above already
        // aligns icon and label.
        brand:
          'bg-brand-400 hover:bg-brand-500 text-white whitespace-nowrap',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    compoundVariants: [
      // The brand canon is fixed geometry: rounded-lg + px-4 py-2, regardless
      // of the size baseline. cva concatenates compoundVariants AFTER size,
      // so these classes win at twMerge — overriding the size's rounded-md
      // (sm/lg) and px-3 / px-8 padding.
      { variant: 'brand', size: 'default', class: 'rounded-lg px-4 py-2' },
      { variant: 'brand', size: 'sm', class: 'rounded-lg px-4 py-2' },
      { variant: 'brand', size: 'lg', class: 'rounded-lg px-4 py-2' },
      { variant: 'brand', size: 'icon', class: 'rounded-lg px-4 py-2' },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
