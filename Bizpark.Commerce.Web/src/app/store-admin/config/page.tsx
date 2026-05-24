'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { updateWebsiteConfig, adminRegisterAdmin } from '@/lib/api';
import type { WebsiteConfigContent } from '@/types';

export default function AdminConfigPage() {
  const { token, config } = useApp();
  const primary = config?.primaryColor ?? '#2563eb';

  // Core branding
  const [businessName, setBusinessName] = useState('');
  const [tagline, setTagline] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [currency, setCurrency] = useState('');

  // Content sections
  const [announcement, setAnnouncement] = useState({ enabled: false, text: '' });
  const [hero, setHero] = useState({ title: '', subtitle: '', imageUrl: '', ctaText: '', ctaLink: '' });
  const [about, setAbout] = useState({ title: '', text: '', imageUrl: '' });
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');

  // SEO
  const [seoDescription, setSeoDescription] = useState('');
  const [seoKeywords, setSeoKeywords] = useState('');
  const [seoOgImage, setSeoOgImage] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Create Admin User
  const [adminForm, setAdminForm] = useState({ email: '', password: '', name: '' });
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMsg, setAdminMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load current config into form
  useEffect(() => {
    if (!config) return;
    setBusinessName(config.businessName ?? '');
    setTagline(config.tagline ?? '');
    setPrimaryColor(config.primaryColor ?? '#2563eb');
    setSecondaryColor(config.secondaryColor ?? '#1e40af');
    setLogoUrl(config.logoUrl ?? '');
    setCurrency(config.currency ?? 'USD');
    const c = config.content;
    if (c?.announcement) setAnnouncement({ enabled: c.announcement.enabled, text: c.announcement.text ?? '' });
    if (c?.hero) setHero({ title: c.hero.title ?? '', subtitle: c.hero.subtitle ?? '', imageUrl: c.hero.imageUrl ?? '', ctaText: c.hero.ctaText ?? '', ctaLink: c.hero.ctaLink ?? '' });
    if (c?.about) setAbout({ title: c.about.title ?? '', text: c.about.text ?? '', imageUrl: c.about.imageUrl ?? '' });
    if (c?.footer) {
      setContactEmail(c.footer.contactEmail ?? '');
      setContactPhone(c.footer.contactPhone ?? '');
      setInstagram(c.footer.socialLinks?.instagram ?? '');
      setFacebook(c.footer.socialLinks?.facebook ?? '');
    }
    if (c?.seo) {
      setSeoDescription(c.seo.metaDescription ?? '');
      setSeoKeywords(c.seo.keywords ?? '');
      setSeoOgImage(c.seo.ogImageUrl ?? '');
    }
  }, [config]);

  const handleSave = async () => {
    if (!token) return;
    setError(''); setSaving(true); setSaved(false);
    try {
      const content: Partial<WebsiteConfigContent> = {
        announcement: { enabled: announcement.enabled, text: announcement.text },
        hero: { title: hero.title, subtitle: hero.subtitle, imageUrl: hero.imageUrl || undefined, ctaText: hero.ctaText, ctaLink: hero.ctaLink },
        about: { title: about.title, text: about.text, imageUrl: about.imageUrl || undefined },
        footer: {
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
          socialLinks: {
            instagram: instagram || undefined,
            facebook: facebook || undefined,
          },
        },
        seo: {
          metaDescription: seoDescription || undefined,
          keywords: seoKeywords || undefined,
          ogImageUrl: seoOgImage || undefined,
        },
      };
      await updateWebsiteConfig(token, {
        businessName: businessName.trim(),
        tagline: tagline.trim() || null,
        primaryColor: primaryColor.trim(),
        secondaryColor: secondaryColor.trim(),
        logoUrl: logoUrl.trim() || null,
        currency: currency.trim().toUpperCase(),
        content,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAdmin = async () => {
    if (!token) return;
    setAdminMsg(null); setAdminSaving(true);
    try {
      await adminRegisterAdmin(token, { email: adminForm.email.trim(), password: adminForm.password, name: adminForm.name.trim() });
      setAdminMsg({ type: 'success', text: `Admin user ${adminForm.email} created.` });
      setAdminForm({ email: '', password: '', name: '' });
    } catch (e: unknown) {
      setAdminMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to create admin' });
    } finally {
      setAdminSaving(false);
    }
  };

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 bg-white';
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white border rounded-xl p-6">
      <h2 className="font-semibold text-gray-900 mb-5 pb-3 border-b">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
  const Field = ({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}{note && <span className="text-gray-400 ml-1 font-normal">{note}</span>}</label>
      {children}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Store Config</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600 font-medium">Saved!</span>}
          {error && <span className="text-sm text-red-500">{error}</span>}
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: primary }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="space-y-6">

        {/* Branding */}
        <Section title="Branding">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Business Name">
              <input className={inputCls} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="My Store" />
            </Field>
            <Field label="Tagline" note="(optional)">
              <input className={inputCls} value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Your store tagline" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Primary Color">
              <div className="flex gap-2">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
                <input className={inputCls} value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} placeholder="#2563eb" />
              </div>
            </Field>
            <Field label="Secondary Color">
              <div className="flex gap-2">
                <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
                <input className={inputCls} value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} placeholder="#1e40af" />
              </div>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Logo URL" note="(optional)">
              <input className={inputCls} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
            </Field>
            <Field label="Currency">
              <input className={inputCls} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" />
            </Field>
          </div>
        </Section>

        {/* Announcement */}
        <Section title="Announcement Bar">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={announcement.enabled} onChange={e => setAnnouncement(a => ({ ...a, enabled: e.target.checked }))} className="rounded" />
            Show announcement bar
          </label>
          {announcement.enabled && (
            <Field label="Announcement Text">
              <input className={inputCls} value={announcement.text} onChange={e => setAnnouncement(a => ({ ...a, text: e.target.value }))} placeholder="Free shipping on orders over $50!" />
            </Field>
          )}
        </Section>

        {/* Hero */}
        <Section title="Hero Section">
          <Field label="Headline">
            <input className={inputCls} value={hero.title} onChange={e => setHero(h => ({ ...h, title: e.target.value }))} placeholder="Welcome to Our Store" />
          </Field>
          <Field label="Subheading" note="(optional)">
            <input className={inputCls} value={hero.subtitle} onChange={e => setHero(h => ({ ...h, subtitle: e.target.value }))} placeholder="Discover amazing products" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="CTA Button Text">
              <input className={inputCls} value={hero.ctaText} onChange={e => setHero(h => ({ ...h, ctaText: e.target.value }))} placeholder="Shop Now" />
            </Field>
            <Field label="CTA Link">
              <input className={inputCls} value={hero.ctaLink} onChange={e => setHero(h => ({ ...h, ctaLink: e.target.value }))} placeholder="/shop" />
            </Field>
          </div>
          <Field label="Background Image URL" note="(optional)">
            <input className={inputCls} value={hero.imageUrl} onChange={e => setHero(h => ({ ...h, imageUrl: e.target.value }))} placeholder="https://..." />
          </Field>
        </Section>

        {/* About */}
        <Section title="About Section">
          <Field label="Title" note="(optional — hide section by leaving blank)">
            <input className={inputCls} value={about.title} onChange={e => setAbout(a => ({ ...a, title: e.target.value }))} placeholder="Our Story" />
          </Field>
          <Field label="Text">
            <textarea className={inputCls} rows={4} value={about.text} onChange={e => setAbout(a => ({ ...a, text: e.target.value }))} placeholder="Tell your brand story..." />
          </Field>
          <Field label="Image URL" note="(optional)">
            <input className={inputCls} value={about.imageUrl} onChange={e => setAbout(a => ({ ...a, imageUrl: e.target.value }))} placeholder="https://..." />
          </Field>
        </Section>

        {/* Footer / Contact */}
        <Section title="Footer & Contact">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Contact Email" note="(optional)">
              <input className={inputCls} type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="hello@yourstore.com" />
            </Field>
            <Field label="Contact Phone" note="(optional)">
              <input className={inputCls} value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+1 555 000 0000" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Instagram handle" note="(without @)">
              <input className={inputCls} value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="yourstore" />
            </Field>
            <Field label="Facebook page">
              <input className={inputCls} value={facebook} onChange={e => setFacebook(e.target.value)} placeholder="yourstore" />
            </Field>
          </div>
        </Section>

        {/* Admin Users */}
        <Section title="Admin Users">
          <p className="text-xs text-gray-500">Create a new admin account for this store.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Name">
              <input className={inputCls} value={adminForm.name} onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" />
            </Field>
            <Field label="Email *">
              <input className={inputCls} type="email" value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@store.com" />
            </Field>
            <Field label="Password *">
              <input className={inputCls} type="password" value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" />
            </Field>
          </div>
          {adminMsg && (
            <p className={`text-xs px-3 py-2 rounded-lg ${adminMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500'}`}>{adminMsg.text}</p>
          )}
          <div className="flex justify-end">
            <button
              onClick={handleCreateAdmin}
              disabled={adminSaving || !adminForm.email || !adminForm.password}
              className="px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: primary }}
            >
              {adminSaving ? 'Creating...' : 'Create Admin'}
            </button>
          </div>
        </Section>

        {/* SEO */}
        <Section title="SEO & Meta Tags">
          <Field label="Meta Description" note="(shown in Google search results)">
            <textarea className={inputCls} rows={2} value={seoDescription} onChange={e => setSeoDescription(e.target.value)} placeholder="A short description of your store for search engines..." maxLength={160} />
            <p className="text-xs text-gray-400 mt-1">{seoDescription.length}/160 characters</p>
          </Field>
          <Field label="Keywords" note="(comma-separated, optional)">
            <input className={inputCls} value={seoKeywords} onChange={e => setSeoKeywords(e.target.value)} placeholder="sneakers, shoes, footwear" />
          </Field>
          <Field label="OG Image URL" note="(shown when shared on social media, optional)">
            <input className={inputCls} value={seoOgImage} onChange={e => setSeoOgImage(e.target.value)} placeholder="https://..." />
          </Field>
        </Section>
      </div>

      <div className="flex justify-end mt-6">
        <button onClick={handleSave} disabled={saving} className="px-8 py-3 rounded-xl text-white font-semibold disabled:opacity-50" style={{ backgroundColor: primary }}>
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
    </div>
  );
}
