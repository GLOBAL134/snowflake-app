import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.local.snowflake.app',
  appName: 'SnowFlake',
  webDir: 'dist',
  backgroundColor: '#0a142e',
  ios: {
    contentInset: 'always'
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
