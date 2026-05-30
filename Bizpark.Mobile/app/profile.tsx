import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppConfig } from '../src/context/AppConfigContext';
import { Ionicons } from '@expo/vector-icons';

export default function ProfileScreen() {
  const { config, reload } = useAppConfig();

  const rows = [
    { icon: 'person-outline' as const,       label: 'My Account' },
    { icon: 'receipt-outline' as const,      label: 'Order History' },
    { icon: 'notifications-outline' as const,label: 'Notifications' },
    { icon: 'help-circle-outline' as const,  label: 'Help & Support' },
    { icon: 'information-circle-outline' as const, label: `About ${config.businessName}` },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: config.backgroundColor }]}
      contentContainerStyle={styles.content}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: config.primaryColor }]}>
        <Text style={styles.avatarEmoji}>{config.appIcon?.emoji ?? '👤'}</Text>
      </View>
      <Text style={[styles.bizName, { color: config.primaryColor }]}>{config.businessName}</Text>
      <Text style={styles.tagline}>{config.tagline}</Text>

      {/* App store keywords preview */}
      <View style={styles.keywordsRow}>
        {config.appStoreKeywords?.split(',').slice(0, 4).map((kw) => (
          <View key={kw} style={[styles.kwChip, { backgroundColor: config.primaryColor + '12' }]}>
            <Text style={[styles.kwText, { color: config.primaryColor }]}>{kw.trim()}</Text>
          </View>
        ))}
      </View>

      <View style={styles.menu}>
        {rows.map((row, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.menuRow, i < rows.length - 1 && styles.menuRowBorder]}
          >
            <Ionicons name={row.icon} size={20} color={config.primaryColor} />
            <Text style={styles.menuLabel}>{row.label}</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </View>

      {/* Dev: reload config button */}
      <TouchableOpacity style={[styles.reloadBtn, { borderColor: config.primaryColor }]} onPress={reload}>
        <Ionicons name="refresh" size={16} color={config.primaryColor} />
        <Text style={[styles.reloadText, { color: config.primaryColor }]}>Reload App Config</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>{config.appStoreDescription}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { alignItems: 'center', padding: 24, paddingBottom: 40 },
  avatar: {
    width: 88, height: 88, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 6,
  },
  avatarEmoji: { fontSize: 44 },
  bizName: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  tagline: { fontSize: 13, color: '#6b7280', fontStyle: 'italic', marginBottom: 16, textAlign: 'center' },
  keywordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 },
  kwChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  kwText: { fontSize: 12, fontWeight: '600' },
  menu: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    overflow: 'hidden', shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06,
    shadowRadius: 8, elevation: 3, marginBottom: 20,
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 15, gap: 12,
  },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: '#1f2937' },
  reloadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10, marginBottom: 24,
  },
  reloadText: { fontSize: 13, fontWeight: '600' },
  footer: { fontSize: 11, color: '#9ca3af', textAlign: 'center', lineHeight: 18 },
});
