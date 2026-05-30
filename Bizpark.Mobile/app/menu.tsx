import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppConfig } from '../src/context/AppConfigContext';
import { Ionicons } from '@expo/vector-icons';

/** Placeholder product catalogue — in production connects to Commerce /api/commerce/catalog */
const PLACEHOLDER_ITEMS = [
  { id: '1', name: 'Featured Item 1', price: '$12.00', emoji: '⭐' },
  { id: '2', name: 'Featured Item 2', price: '$8.50',  emoji: '🔥' },
  { id: '3', name: 'Featured Item 3', price: '$15.00', emoji: '✨' },
  { id: '4', name: 'Featured Item 4', price: '$6.00',  emoji: '💎' },
];

export default function MenuScreen() {
  const { config } = useAppConfig();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: config.backgroundColor }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.heading, { color: config.primaryColor }]}>
        {config.navigation?.[1]?.label ?? 'Menu'}
      </Text>
      <Text style={styles.subheading}>Browse our offerings</Text>

      <View style={styles.grid}>
        {PLACEHOLDER_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.card, { borderColor: config.primaryColor + '20' }]}
          >
            <View style={[styles.cardEmoji, { backgroundColor: config.primaryColor + '12' }]}>
              <Text style={styles.emoji}>{item.emoji}</Text>
            </View>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={[styles.itemPrice, { color: config.primaryColor }]}>{item.price}</Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: config.primaryColor }]}
            >
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.banner, { backgroundColor: config.accentColor + '20', borderColor: config.accentColor }]}>
        <Ionicons name="storefront" size={20} color={config.accentColor} />
        <Text style={[styles.bannerText, { color: config.accentColor }]}>
          Connect to {config.businessName}'s Commerce backend to show real products
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  heading: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 16,
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
  cardEmoji: {
    width: 60, height: 60, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  emoji: { fontSize: 30 },
  itemName: { fontSize: 13, fontWeight: '600', color: '#1f2937', textAlign: 'center' },
  itemPrice: { fontSize: 15, fontWeight: '700' },
  addBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
  },
  bannerText: { flex: 1, fontSize: 12, fontWeight: '600' },
});
