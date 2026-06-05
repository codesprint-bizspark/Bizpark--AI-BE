import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWebsiteConfigDto {
  @ApiPropertyOptional({ example: 'My Awesome Store' })
  @IsOptional() @IsString()
  businessName?: string;

  @ApiPropertyOptional({ example: 'Quality products at great prices', nullable: true })
  @IsOptional() @IsString()
  tagline?: string | null;

  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional() @IsString()
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#1e40af' })
  @IsOptional() @IsString()
  secondaryColor?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.png', nullable: true })
  @IsOptional() @IsString()
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/favicon.ico', nullable: true })
  @IsOptional() @IsString()
  faviconUrl?: string | null;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'en-US' })
  @IsOptional() @IsString()
  locale?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({
    description: 'Nested content: announcement, hero, about, footer, seo',
    example: {
      announcement: { enabled: true, text: 'Free shipping on orders over $50!' },
      hero: { title: 'Welcome', subtitle: 'Shop now', ctaText: 'Shop', ctaLink: '/shop' },
      seo: { metaDescription: 'Best store ever', keywords: 'shoes, clothing' },
    },
  })
  @IsOptional() @IsObject()
  content?: Record<string, unknown>;
}
