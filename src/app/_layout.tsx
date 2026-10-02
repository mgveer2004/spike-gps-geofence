import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export const unstable_settings = {
  initialRouteName: '(route)',
};

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(route)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
