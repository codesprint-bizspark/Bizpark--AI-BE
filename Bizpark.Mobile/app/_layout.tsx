import { AppConfigProvider } from '../src/context/AppConfigContext';
import { Tabs, useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppConfig } from '../src/context/AppConfigContext';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Tenant resolution priority:
//   1. Deep-link / QR scan param  → exp://host/--/?tenant=<id>
//   2. EXPO_PUBLIC_TENANT_ID env  → baked-in per-client build
const ENV_TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID ?? null;

function AppTabs() {
  const { config, isLoading } = useAppConfig();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color={config.primaryColor} />
      </View>
    );
  }

  // Map nav items from config to Expo Router tabs
  const navItems = config.navigation ?? [];

  const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
    home: 'home',
    grid: 'grid',
    receipt: 'receipt',
    user: 'person',
    heart: 'heart',
    star: 'star',
    bell: 'notifications',
    map: 'map',
    camera: 'camera',
    tag: 'pricetag',
    person: 'person',
  };

  return (
    <>
      <StatusBar style="auto" />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: config.primaryColor,
          tabBarInactiveTintColor: '#9ca3af',
          tabBarStyle: {
            backgroundColor: config.backgroundColor,
            borderTopColor: '#e5e7eb',
            height: 60,
            paddingBottom: 8,
          },
          headerStyle: { backgroundColor: config.primaryColor },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: navItems[0]?.label ?? 'Home',
            tabBarIcon: ({ color }) => (
              <Ionicons name={iconMap[navItems[0]?.icon ?? 'home'] ?? 'home'} size={22} color={color} />
            ),
            headerTitle: config.businessName,
          }}
        />
        <Tabs.Screen
          name="menu"
          options={{
            title: navItems[1]?.label ?? 'Menu',
            tabBarIcon: ({ color }) => (
              <Ionicons name={iconMap[navItems[1]?.icon ?? 'grid'] ?? 'grid'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: navItems[2]?.label ?? 'Orders',
            tabBarIcon: ({ color }) => (
              <Ionicons name={iconMap[navItems[2]?.icon ?? 'receipt'] ?? 'receipt'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: navItems[3]?.label ?? 'Profile',
            tabBarIcon: ({ color }) => (
              <Ionicons name={iconMap[navItems[3]?.icon ?? 'person'] ?? 'person'} size={22} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

export default function RootLayout() {
  const params = useGlobalSearchParams<{ tenant?: string }>();
  const tenantFromLink = typeof params.tenant === 'string' ? params.tenant : null;
  const tenantId = tenantFromLink || ENV_TENANT_ID;

  return (
    <AppConfigProvider tenantId={tenantId}>
      <AppTabs />
    </AppConfigProvider>
  );
}
