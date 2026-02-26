import Head from 'next/head'
import '../styles/globals.css'
import { SessionProvider } from 'next-auth/react'
import { ProfileProvider } from '../shared/context/ProfileContext'
import { AppAccessProvider } from '../shared/context/AppAccessContext'
import RequireAuth from '../shared/components/RequireAuth'
import WelcomeModal from '../shared/components/WelcomeModal'

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <RequireAuth>
        <ProfileProvider>
          <AppAccessProvider>
            <WelcomeModal />
            <Component {...pageProps} />
          </AppAccessProvider>
        </ProfileProvider>
      </RequireAuth>
    </SessionProvider>
  )
}
