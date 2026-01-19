import '../styles/globals.css'
import { ProfileProvider } from '../shared/context/ProfileContext'

export default function App({ Component, pageProps }) {
  return (
    <ProfileProvider>
      <Component {...pageProps} />
    </ProfileProvider>
  )
}