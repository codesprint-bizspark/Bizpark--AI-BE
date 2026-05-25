import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Mobile app configuration — agent populates via PATCH /api/commerce/mobile-app-config
 * The Bizpark.Mobile app template reads this at runtime to configure itself.
 */
@Entity({ name: 'mobile_app_config' })
export class MobileAppConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // ── Core Branding ─────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 255, default: 'My App' })
  businessName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tagline!: string | null;

  @Column({ type: 'varchar', length: 50, default: '#2563eb' })
  primaryColor!: string;

  @Column({ type: 'varchar', length: 50, default: '#f59e0b' })
  accentColor!: string;

  @Column({ type: 'varchar', length: 50, default: '#ffffff' })
  backgroundColor!: string;

  @Column({ type: 'boolean', default: true })
  isPublished!: boolean;

  // ── Full AI-generated config blob ─────────────────────────────────
  // Contains: splashScreen, navigation, screens, appStoreDescription,
  // appStoreKeywords, notificationMessages, appIcon
  @Column({ type: 'jsonb', nullable: true })
  config!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
