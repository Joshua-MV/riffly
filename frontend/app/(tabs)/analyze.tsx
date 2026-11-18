import { Redirect } from 'expo-router';

/** Importing now lives on My Songs (drop zone + Import audio). */
export default function AnalyzeScreen() {
  return <Redirect href="/library" />;
}
