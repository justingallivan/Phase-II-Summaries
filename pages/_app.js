import '../styles/globals.css'
import { SessionProvider } from 'next-auth/react'
import { ProfileProvider } from '../shared/context/ProfileContext'
import { AppAccessProvider } from '../shared/context/AppAccessContext'
import RequireAuth from '../shared/components/RequireAuth'

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <RequireAuth>
        <ProfileProvider>
          <AppAccessProvider>
            <Component {...pageProps} />
          </AppAccessProvider>
        </ProfileProvider>
      </RequireAuth>
    </SessionProvider>
  )
}
