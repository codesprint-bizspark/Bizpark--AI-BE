import { Column, CreateDateColumn, DeleteDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'products' })
export class ProductEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price!: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency!: string;

  // Optional product image (Supabase Storage public URL) — null = no image
  @Column({ type: 'text', nullable: true })
  imageUrl!: string | null;

  // Optional category — null = uncategorised
  @Column({ type: 'uuid', nullable: true })
  categoryId!: string | null;

  // Soft delete — null = active; set = deleted
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
