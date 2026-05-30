/**
 * MobileAppConfig — fetched from GET /api/commerce/mobile-app-config
 * Shape matches the AI-generated output from mobile_app_builder.py
 */
export interface NavItem {
  key: string;
  label: string;
  icon: string;
}

export interface HomeScreen {
  heroTitle: string;
  heroSubtitle: string;
  ctaText: string;
  promoText: string;
}

export interface AboutScreen {
  title: string;
  text: string;
}

export interface AppScreens {
  home: HomeScreen;
  about: AboutScreen;
}

export interface AppIcon {
  emoji: string;
  backgroundColor: string;
}

export interface SplashScreenConfig {
  title: string;
  subtitle: string;
}

export interface NotificationMessages {
  orderConfirmed: string;
  orderReady: string;
}

export interface MobileAppConfig {
  businessName: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  appIcon: AppIcon;
  splashScreen: SplashScreenConfig;
  navigation: NavItem[];
  screens: AppScreens;
  appStoreDescription: string;
  appStoreKeywords: string;
  notificationMessages: NotificationMessages;
}

export interface CommerceConfigResponse {
  id: string;
  businessName: string;
  tagline: string | null;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  isPublished: boolean;
  config: MobileAppConfig | null;
}
