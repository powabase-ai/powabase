import Document, { DocumentContext, Head, Html, Main, NextScript } from 'next/document'

import { CONSENT_REQUIRED_REGIONS } from '@/lib/consent-mode'
import { BASE_PATH, GTM_ENABLED, GTM_ID, IS_PLATFORM } from '@/lib/constants'

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx)

    return initialProps
  }

  render() {
    return (
      <Html lang="en">
        <Head>
          {/* Google Tag Manager — bootstrap half. Rendered here in _document
              (not an afterInteractive <Script> in _app) so it lands in the server
              HTML as early as possible in <head>: a low/late tag is what Google
              Tag Diagnostics flags as "Tag not placed correctly". The matching
              <noscript> half is at the top of <body> below (GTM needs both); both
              are gated on GTM_ENABLED and interpolate the constants-validated
              GTM_ID.

              Consent Mode v2 defaults are set inline BEFORE the gtm.js loader —
              the same region-aware posture GoogleAnalyticsTag uses (EEA denied via
              CONSENT_REQUIRED_REGIONS, granted elsewhere). Co-locating them here,
              rather than relying on GoogleAnalyticsTag's afterInteractive push into
              the shared dataLayer, means gtm.js always inits with the full, correct
              consent picture — so a load-time container tag can't snapshot EEA
              consent as `granted` in the window before that later push lands.
              GoogleAnalyticsTag (_app.tsx) still re-pushes the same defaults; that
              is now redundant and harmless. */}
          {GTM_ENABLED && (
            <script
              id="gtm-bootstrap"
              dangerouslySetInnerHTML={{
                __html:
                  `window.dataLayer=window.dataLayer||[];` +
                  `function gtag(){dataLayer.push(arguments);}` +
                  `gtag('consent','default',{'ad_storage':'denied','ad_user_data':'denied',` +
                  `'ad_personalization':'denied','analytics_storage':'denied',` +
                  `'region':${JSON.stringify(CONSENT_REQUIRED_REGIONS)},'wait_for_update':500});` +
                  `gtag('consent','default',{'ad_storage':'granted','ad_user_data':'granted',` +
                  `'ad_personalization':'granted','analytics_storage':'granted'});` +
                  `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':` +
                  `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],` +
                  `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=` +
                  `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
                  `})(window,document,'script','dataLayer','${GTM_ID}');`,
              }}
            />
          )}
          {/* Workaround for https://github.com/suren-atoyan/monaco-react/issues/272 */}
          <link
            rel="stylesheet"
            type="text/css"
            data-name="vs/editor/editor.main"
            href={
              IS_PLATFORM
                ? 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/editor/editor.main.css'
                : `${BASE_PATH}/monaco-editor/editor/editor.main.css`
            }
          />
        </Head>
        <body>
          {/* Google Tag Manager (noscript) — the no-JS half of the tag; the
              bootstrap script half is the first node in <head> above. Same
              GTM_ENABLED gate. GTM_ID is validated in constants before
              interpolation. */}
          {GTM_ENABLED && (
            <noscript>
              <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
                height="0"
                width="0"
                style={{ display: 'none', visibility: 'hidden' }}
              />
            </noscript>
          )}
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
