'use client'

import { useConsentState } from 'common'
import Link from 'next/link'
import { PropsWithChildren, useState } from 'react'
import { Modal, Toggle } from 'ui'

import { Admonition } from '../admonition'

interface PrivacySettingsProps {
  className?: string
}

export const PrivacySettings = ({
  children,
  ...props
}: PropsWithChildren<PrivacySettingsProps>) => {
  const [isOpen, setIsOpen] = useState(false)
  const { categories, updateServices, source } = useConsentState()
  // Bridged consent has no per-service granularity (no CMP categories) — manage
  // it via the all-or-nothing Analytics toggle in Account → Preferences, which
  // writes the shared cookie. Distinct from a genuine CMP-load failure.
  const isBridged = source === 'bridge'

  const [serviceConsentMap, setServiceConsentMap] = useState(() => new Map<string, boolean>())

  function handleServicesChange(services: { id: string; status: boolean }[]) {
    let newServiceConsentMap = new Map(serviceConsentMap)
    services.forEach((service) => {
      newServiceConsentMap.set(service.id, service.status)
    })
    setServiceConsentMap(newServiceConsentMap)
  }

  const handleConfirmPreferences = () => {
    const services = Array.from(serviceConsentMap.entries()).map(([id, status]) => ({
      serviceId: id,
      status,
    }))
    updateServices(services)

    setIsOpen(false)
  }

  const handleCancel = () => {
    setIsOpen(false)
  }

  return (
    <>
      <button {...props} onClick={() => setIsOpen(true)}>
        {children}
      </button>

      <Modal
        closable
        visible={isOpen}
        alignFooter="right"
        onCancel={handleCancel}
        onConfirm={handleConfirmPreferences}
        // No per-service categories => the Confirm button would be a no-op
        // (updateServices needs the CMP). Hide it for both bridged users (use
        // the Analytics toggle instead) and genuine CMP-load failures.
        hideFooter={categories === null}
        header="Privacy Settings"
        onInteractOutside={(e) => {
          // Only hide menu when clicking outside, not focusing outside
          // Prevents Firefox dropdown issue that immediately closes menu after opening
          if (e.type === 'dismissableLayer.pointerDownOutside') {
            setIsOpen(!isOpen)
          }
        }}
        className="max-w-[calc(100vw-4rem)]"
        size="medium"
      >
        <div className="pt-3 divide-y divide-border">
          {categories === null ? (
            <Modal.Content>
              {isBridged ? (
                <Admonition
                  type="note"
                  title="Manage your cookie preferences"
                  description={
                    <>
                      Your analytics &amp; marketing consent applies across powabase.ai and the
                      Powabase app. Use the <strong>Analytics and Marketing</strong> toggle in
                      Account → Preferences to change or withdraw it. Granular per-service settings
                      aren&apos;t available here.
                    </>
                  }
                />
              ) : (
                <Admonition
                  type="warning"
                  title="Unable to Load Privacy Settings"
                  description={
                    <>
                      We couldn't load the privacy settings due to an ad blocker or network error.
                      Please disable any ad blockers and try again. If the problem persists, please{' '}
                      <Link href="https://supabase.com/dashboard/support/new" className="underline">
                        contact support
                      </Link>
                      .
                    </>
                  }
                />
              )}
            </Modal.Content>
          ) : (
            [...categories]
              .reverse()
              .map((category) => (
                <Category
                  key={category.slug}
                  category={category}
                  handleServicesChange={handleServicesChange}
                />
              ))
          )}
        </div>
      </Modal>
    </>
  )
}

function Category({
  category,
  handleServicesChange,
}: {
  category: {
    slug: string
    label: string
    description: string
    isEssential: boolean
    services: readonly {
      id: string
      consent: {
        status: boolean
      }
    }[]
  }
  handleServicesChange: (services: { id: string; status: boolean }[]) => void
}) {
  const [isChecked, setIsChecked] = useState(() =>
    category.services.every((service) => service.consent.status)
  )

  function handleChange() {
    setIsChecked(!isChecked)

    handleServicesChange(
      category.services.map((service) => ({
        id: service.id,
        status: !isChecked,
      }))
    )
  }

  return (
    <Modal.Content key={category.slug}>
      <Toggle
        checked={isChecked}
        defaultChecked={isChecked}
        disabled={category.isEssential}
        onChange={handleChange}
        label={category.label}
        descriptionText={
          <>
            {category.description}
            <br />
            <Link
              href="https://supabase.com/privacy#8-cookies-and-similar-technologies-used-on-our-european-services"
              className="underline"
            >
              Learn more
            </Link>
          </>
        }
      />
    </Modal.Content>
  )
}
