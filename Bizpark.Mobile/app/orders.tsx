import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppConfig } from '../src/context/AppConfigContext';
import { Ionicons } from '@expo/vector-icons';

const PLACEHOLDER_ORDERS = [
  { id: '#1042', status: 'Ready', items: 'Latte × 2, Muffin × 1', total: '$14.50', statusColor: '#22c55e' },
  { id: '#1039', status: 'Processing', items: 'Cappuccino × 1', total: '$6.00',  statusColor: '#f59e0b' },
  { id: '#1035', status: 'Delivered', items: 'Cold Brew × 3', total: '$21.00', statusColor: '#6b7280' },
];

export default function OrdersScreen() {
  const { config } = useAppConfig();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: config.backgroundColor }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.heading, { color: config.primaryColor }]}>
        {config.navigation?.[2]?.label ?? 'Orders'}
      </Text>
      <Text style={styles.subheading}>Your recent orders</Text>

      {PLACEHOLDER_ORDERS.map((order) => (
        <View key={order.id} style={[styles.card, { borderLeftColor: config.primaryColor }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.orderId}>{order.id}</Text>
            <View style={[styles.badge, { backgroundColor: order.statusColor + '20' }]}>
              <Text style={[styles.badgeText, { color: order.statusColor }]}>{order.status}</Text>
            </View>
          </View>
          <Text style={styles.items}>{order.items}</Text>
          <View style={styles.cardFooter}>
            <Text style={[styles.total, { color: config.primaryColor }]}>{order.total}</Text>
            <TouchableOpacity style={[styles.reorderBtn, { borderColor: config.primaryColor }]}>
              <Ionicons name="refresh" size={13} color={config.primaryColor} />
              <Text style={[styles.reorderText, { color: config.primaryColor }]}>Reorder</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <View style={[styles.notification, { backgroundColor: config.primaryColor + '10', borderColor: config.primaryColor + '30' }]}>
        <Ionicons name="notifications" size={18} color={config.primaryColor} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.notifTitle, { color: config.primaryColor }]}>Push Notifications</Text>
          <Text style={styles.notifBody}>{config.notificationMessages?.orderReady}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  heading: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  subheading: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  items: { fontSize: 13, color: '#4b5563', marginBottom: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontSize: 16, fontWeight: '800' },
  reorderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  reorderText: { fontSize: 12, fontWeight: '600' },
  notification: {
    flexDirection: 'row', gap: 12, borderWidth: 1.5,
    borderRadius: 14, padding: 14, marginTop: 8, alignItems: 'flex-start',
  },
  notifTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  notifBody: { fontSize: 12, color: '#6b7280' },
});
