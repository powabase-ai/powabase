import { useConsentState } from 'common'
import Script from 'next/script'

import { IS_PLATFORM, REDDIT_PIXEL_ID } from './constants'

export const RedditPixel = () => {
  const { hasAccepted } = useConsentState()

  if (!IS_PLATFORM || !REDDIT_PIXEL_ID || !hasAccepted) return null

  return (
    <Script
      id="reddit-pixel"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `!function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js?pixel_id=${REDDIT_PIXEL_ID}",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);rdt('init','${REDDIT_PIXEL_ID}');rdt('track','PageVisit');`,
      }}
    />
  )
}
