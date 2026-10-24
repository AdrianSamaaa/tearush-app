import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tearush.app',
  appName: 'TeaRush',
  webDir: 'www',
  android: {
    // Allows the app to reach a plain-http API while testing on a LAN
    // (e.g. http://192.168.1.10:3000). Production should use an https:// server.
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#3C2415',
      showSpinner: false,
    },
    SystemBars: {
      // Inject real status/navigation bar sizes as CSS variables (used in theme/variables.scss).
      insetsHandling: 'css',
      // Dark icons on our light header.
      style: 'LIGHT',
      initialViewportFitValueHint: 'cover',
    },
    Keyboard: {
      // Keep inputs visible above the keyboard in edge-to-edge mode.
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_tearush',
      iconColor: '#C6873F',
    },
  },
};

export default config;
