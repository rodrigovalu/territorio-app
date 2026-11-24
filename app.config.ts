import type { ExpoConfig } from 'expo/config';

/**
 * Configuração do app. Valores sensíveis vêm de variáveis de ambiente (.env / EAS secrets).
 * Nada aqui é segredo de servidor: a chave "anon/publishable" do Supabase é pública por
 * definição — a segurança está nas regras RLS do banco.
 */
const config: ExpoConfig = {
  name: 'Território',
  slug: 'territorio',
  owner: 'rodrigovalus-team',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'territorio',
  userInterfaceStyle: 'dark',
  android: {
    package: process.env.ANDROID_PACKAGE ?? 'br.com.territorio.app',
    // Firebase (necessário para notificações push no Android). No EAS: variável do tipo arquivo GOOGLE_SERVICES_JSON
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? (require('fs').existsSync('./google-services.json') ? './google-services.json' : undefined),
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#0E1116',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    // Não incluir tokens de sessão no backup do Google Drive
    allowBackup: false,
    // Permissões mínimas: localização só em primeiro plano + serviço em primeiro plano
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
    ],
    blockedPermissions: [
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      { backgroundColor: '#0E1116', image: './assets/images/splash-icon.png', imageWidth: 76 },
    ],
    [
      'expo-location',
      {
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY }],
    '@react-native-google-signin/google-signin',
    ['expo-notifications', { color: '#FF6A2B', defaultChannel: 'territorio-alertas' }],
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: false,
          // O R8 (otimização do SDK 58) removia classes que o WorkManager/Room criam por reflexão
          // e o app fechava ao abrir. Desligado até validarmos regras de proguard em todas as libs.
          enableMinifyInReleaseBuilds: false,
          enableShrinkResourcesInReleaseBuilds: false,
          extraProguardRules: [
            '-keep class androidx.work.impl.WorkDatabase_Impl { *; }',
            '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
          ].join('\n'),
        },
      },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    eas: { projectId: 'b84d31be-3946-4c34-93cc-78d12b4101c5' },
  },
};

export default config;
