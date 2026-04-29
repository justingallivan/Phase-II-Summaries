import Head from 'next/head'
import { Analytics } from '@vercel/analytics/next'
import { useRouter } from 'next/router'
import '../styles/globals.css'
import { SessionProvider } from 'next-auth/react'
import { ProfileProvider } from '../shared/context/ProfileContext'
import { AppAccessProvider } from '../shared/context/AppAccessContext'
import RequireAuth from '../shared/components/RequireAuth'
import WelcomeModal from '../shared/components/WelcomeModal'

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  const router = useRouter();
  // Auth pages render before any session/profile exists. Skip the
  // profile/app-access providers there so they don't fire authenticated
  // API calls that get redirected to HTML and break JSON.parse.
  const isAuthPage = router.pathname.startsWith('/auth/');

  const inner = isAuthPage ? (
    <Component {...pageProps} />
  ) : (
    <RequireAuth>
      <ProfileProvider>
        <AppAccessProvider>
          <WelcomeModal />
          <Component {...pageProps} />
          <Analytics />
        </AppAccessProvider>
      </ProfileProvider>
    </RequireAuth>
  );

  return (
    <SessionProvider session={session} refetchOnWindowFocus={true}>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </Head>
      {inner}
    </SessionProvider>
  )
}
