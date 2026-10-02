import { Stack } from 'expo-router';

import { OutboxProvider } from '../../state/outbox-context';
import { RouteProvider } from '../../state/route-context';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RouteLayout() {
  return (
    <RouteProvider>
      <OutboxProvider>
        <Stack>
          <Stack.Screen name="index" options={{ title: "Today's Route" }} />
          <Stack.Screen name="navigate" options={{ title: 'Navigation', headerBackTitle: 'Route' }} />
        </Stack>
      </OutboxProvider>
    </RouteProvider>
  );
}
