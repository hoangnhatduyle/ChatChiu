// The Fire shell: the web build wrapped as an Android app (roadmap 5.9, D14: sideloaded on the Fire Max 11).
// Nothing here is a secret: the web build carries only public values (see README.md).
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.chatchiu.fire',
  appName: 'Chắt Chiu',
  // The shell bundles one build of the web app; the live-update check replaces it when the site has a newer one.
  webDir: '../web/dist',
  server: {
    // The app is served from https://localhost inside the tablet: that origin must be allowed by the API (README).
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    // A debug APK is what is sideloaded; there is no Play Store build.
    buildOptions: {},
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_chatchiu',
      iconColor: '#0b6e75',
    },
    CapacitorUpdater: {
      // Manual mode: core/native/live-update.ts decides when to download and switch (never automatic).
      autoUpdate: false,
      // No usage reports to the plugin vendor's server (the default would send them).
      statsUrl: '',
    },
  },
}

export default config
