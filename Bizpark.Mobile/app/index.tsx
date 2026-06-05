import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useAppConfig } from '../src/context/AppConfigContext';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const { config } = useAppConfig();
  const home = config.screens?.home;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: config.backgroundColor }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Promo Banner */}
      {home?.promoText ? (
        <View style={[styles.promoBanner, { backgroundColor: config.accentColor }]}>
          <Text style={styles.promoText}>{home.promoText}</Text>
        </View>
      ) : null}

      {/* Hero Card */}
      <View style={[styles.heroCard, { backgroundColor: config.primaryColor }]}>
        <Text style={styles.heroEmoji}>{config.appIcon?.emoji ?? '🏪'}</Text>
        <Text style={styles.heroTitle}>{home?.heroTitle ?? config.businessName}</Text>
        <Text style={styles.heroSubtitle}>{home?.heroSubtitle ?? config.tagline}</Text>
        <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: config.accentColor }]}>
          <Text style={styles.ctaBtnText}>{home?.ctaText ?? 'Order Now'}</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tagline */}
      <Text style={[styles.tagline, { color: config.primaryColor }]}>
        {config.tagline}
      </Text>

      {/* Feature tiles from navigation */}
      <View style={styles.tileGrid}>
        {config.navigation?.map((item, i) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.tile, { borderColor: config.primaryColor + '22' }]}
          >
            <View style={[styles.tileIcon, { backgroundColor: config.primaryColor + '15' }]}>
              <Ionicons
                name={
                  ({
                    home: 'home', grid: 'grid', receipt: 'receipt',
                    user: 'person', heart: 'heart', star: 'star',
                    bell: 'notifications', map: 'map', camera: 'camera',
                    tag: 'pricetag', person: 'person',
                  }[item.icon] as any) ?? 'apps'
                }
                size={22}
                color={config.primaryColor}
              />
            </View>
            <Text style={[styles.tileLabel, { color: '#1f2937' }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* About section */}
      <View style={[styles.aboutCard, { backgroundColor: '#f9fafb' }]}>
        <Text style={[styles.aboutTitle, { color: config.primaryColor }]}>
          {config.screens?.about?.title ?? 'About Us'}
        </Text>
        <Text style={styles.aboutText}>
          {config.screens?.about?.text ?? ''}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  promoBanner: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  promoText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  heroCard: {
    margin: 16,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  heroEmoji: { fontSize: 48, marginBottom: 12 },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 50,
  },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  tagline: {
    textAlign: 'center',
    fontSize: 13,
    fontStyle: 'italic',
    marginHorizontal: 24,
    marginBottom: 20,
    opacity: 0.8,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 12,
    justifyContent: 'center',
    marginBottom: 20,
  },
  tile: {
    width: (width - 60) / 2,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { fontSize: 13, fontWeight: '600' },
  aboutCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
  },
  aboutTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  aboutText: { fontSize: 14, color: '#4b5563', lineHeight: 22 },
});
