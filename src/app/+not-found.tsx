import { type Href, Redirect } from 'expo-router';

/** Expo Go sometimes opens exp://host/~ which is not a real page. Send the MR to the doctor list. */
export default function UnmatchedRoute() {
  return <Redirect href={'/' as Href} />;
}
