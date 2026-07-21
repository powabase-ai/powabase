import { Loader2 } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useRouter } from 'next/router'
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  singleThemes,
  Theme,
} from 'ui'

import { ButtonTooltip } from '../ui/ButtonTooltip'

import { ProfileImage } from '@/components/ui/ProfileImage'
import { useIsPlatformAdminQuery } from '@/data/admin/use-is-platform-admin-query'
import { useIsFeatureEnabled } from '@/hooks/misc/useIsFeatureEnabled'
import { IS_PLATFORM } from '@/lib/constants'
import { useProfileNameAndPicture } from '@/lib/profile'

export function UserDropdown({
  triggerClassName,
  contentClassName,
}: {
  triggerClassName?: string
  contentClassName?: string
}) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const profileShowEmailEnabled = useIsFeatureEnabled('profile:show_email')
  const { username, avatarUrl, primaryEmail, isLoading } = useProfileNameAndPicture()
  const { data: whoami } = useIsPlatformAdminQuery()
  const isAdmin = whoami?.is_admin ?? false

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className={cn('border flex-shrink-0 px-3', triggerClassName)}>
        <ButtonTooltip
          type="default"
          className="[&>span]:flex px-0 py-0 rounded-full overflow-hidden h-8 w-8"
          tooltip={{ content: { text: 'Account settings' } }}
        >
          {isLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="animate-spin text-foreground-lighter" size={16} />
            </div>
          ) : (
            <ProfileImage alt={username} src={avatarUrl} className="w-8 h-8 rounded-md" />
          )}
        </ButtonTooltip>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="end" className={contentClassName}>
        {IS_PLATFORM && (
          <>
            <div className="px-2 py-1 flex flex-col gap-0 text-sm">
              {!!username ? (
                <>
                  <span title={username} className="w-full text-left text-foreground truncate">
                    {username}
                  </span>
                  {primaryEmail !== username && profileShowEmailEnabled && (
                    <span
                      title={primaryEmail}
                      className="w-full text-left text-foreground-light text-xs truncate"
                    >
                      {primaryEmail}
                    </span>
                  )}
                </>
              ) : (
                <span title={primaryEmail} className="w-full text-left text-foreground truncate">
                  {primaryEmail}
                </span>
              )}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => {
              setTheme(value)
            }}
          >
            {singleThemes.map((theme: Theme) => (
              <DropdownMenuRadioItem
                key={theme.value}
                value={theme.value}
                className="cursor-pointer"
              >
                {theme.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {IS_PLATFORM && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {isAdmin && (
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => {
                    router.push('/admin')
                  }}
                >
                  Admin
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => {
                  router.push('/account/me')
                }}
              >
                Account preferences
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => {
                  router.push('/logout')
                }}
              >
                Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
