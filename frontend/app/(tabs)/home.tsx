import { Redirect } from 'expo-router';

/** The old home dashboard; the app now opens on the tuner and keeps songs on My Songs. */
export default function HomeScreen() {
  return <Redirect href="/library" />;
}
