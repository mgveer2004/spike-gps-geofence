export default {
  expo: {
    name: "spike-gps-geofence",
    slug: "spike-gps-geofence",
    version: "1.0.0",
    orientation: "portrait",
    scheme: "spikegpsgeofence",
    userInterfaceStyle: "automatic",
    ios: {
      icon: "./assets/expo.icon"
    },
    android: {
      package: "com.dravya.spikegps",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE"
      },
      predictiveBackGestureEnabled: false,
      config: {
        googleMaps: {
          // This safely pulls the key from your .env file
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        }
      },
      permissions: [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    },
    web: {
      output: "static"
    },
    plugins: [
      "expo-router",
      [
        "react-native-maps",
        {
          // This also pulls the key safely from your .env file
          androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        }
      ],
      [
        "expo-splash-screen",
        {
          backgroundColor: "#208AEF",
          image: "./assets/splash-icon.png"
        }
      ],
      "expo-sqlite",
      [
        "expo-location",
        {
          locationWhenInUsePermission: "Dravya uses your location while the app is open to detect when you arrive at and leave a doctor's clinic."
        }
      ]
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "7964ab5b-e87c-47f6-9a8e-c932d07832d1"
      }
    }
  }
};