import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Flexible content sections — agent updates these via PATCH /api/commerce/website-config
 * All fields optional so partial updates work cleanly.
 */
export interface WebsiteConfigContent {
  announcement?: {
    enabled: boolean;
    text: string;
    bgColor?: string;        // defaults to primaryColor
    textColor?: string;      // defaults to white
  };
  hero?: {
    title?: string;
    subtitle?: string;
    imageUrl?: string;
    ctaText?: string;        // e.g. "Shop Now"
    ctaLink?: string;        // e.g. "/shop"
  };
  features?: Array<{
    icon: string;            // 'truck' | 'refresh' | 'shield' | 'sparkles' | 'headphones'
    title: string;
    description: string;
  }>;
  about?: {
    title?: string;
    text?: string;
    imageUrl?: string;
  };
  footer?: {
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    socialLinks?: {
      instagram?: string;
      facebook?: string;
      twitter?: string;
      tiktok?: string;
    };
    policies?: {
      returns?: string;
      shipping?: string;
    };
  };
  seo?: {
    metaDescription?: string;
    ogImageUrl?: string;
    keywords?: string;
  };
}

@Entity({ name: 'website_config' })
export class WebsiteConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // ── Core Branding ─────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 255, default: 'My Store' })
  businessName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tagline!: string | null;

  // varchar(50) to allow hex, rgb(), hsl() values
  @Column({ type: 'varchar', length: 50, default: '#2563eb' })
  primaryColor!: string;

  @Column({ type: 'varchar', length: 50, default: '#1e40af' })
  secondaryColor!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  faviconUrl!: string | null;

  // ── Locale ────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency!: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  locale!: string;

  @Column({ type: 'boolean', default: true })
  isPublished!: boolean;

  // ── Flexible Content (agent-driven) ───────────────────────────────
  // All page sections live here — agent calls PATCH with any subset
  @Column({ type: 'jsonb', nullable: true })
  content!: WebsiteConfigContent | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
