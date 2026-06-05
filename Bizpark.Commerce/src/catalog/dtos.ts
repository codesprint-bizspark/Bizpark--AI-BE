import { IsBoolean, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Classic White T-Shirt' })
  @IsString() @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ example: 'Premium cotton, unisex fit.' })
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ example: 29.99 })
  @Type(() => Number) @IsNumber() @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'uuid-of-category' })
  @IsOptional() @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'https://...supabase.co/.../image.png', description: 'Product image URL (use the media upload endpoint)' })
  @IsOptional() @IsString()
  imageUrl?: string | null;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Classic White T-Shirt v2' })
  @IsOptional() @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description.' })
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 34.99 })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional() @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'uuid-of-category', nullable: true })
  @IsOptional() @IsString()
  categoryId?: string | null;

  @ApiPropertyOptional({ example: 'https://...supabase.co/.../image.png', nullable: true })
  @IsOptional() @IsString()
  imageUrl?: string | null;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Clothing' })
  @IsString() @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'clothing' })
  @IsString() @IsNotEmpty()
  slug!: string;

  @ApiPropertyOptional({ example: 'All clothing items' })
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ example: null, nullable: true, description: 'Parent category UUID for nested categories' })
  @IsOptional() @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional() @Type(() => Number) @IsNumber()
  sortOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Clothing' })
  @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'clothing' })
  @IsOptional() @IsString()
  slug?: string;

  @ApiPropertyOptional({ example: 'All clothing items' })
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional() @Type(() => Number) @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateVariantDto {
  @ApiProperty({ example: 'Large / Blue' })
  @IsString() @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'TSHIRT-L-BLUE' })
  @IsString() @IsNotEmpty()
  sku!: string;

  @ApiPropertyOptional({ example: 34.99, nullable: true, description: 'Override price; null = use base product price' })
  @IsOptional() @Type(() => Number) @IsNumber()
  price?: number | null;

  @ApiPropertyOptional({ example: { size: 'L', color: 'Blue' } })
  @IsOptional() @IsObject()
  attributes?: Record<string, string>;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateVariantDto {
  @ApiPropertyOptional({ example: 'Large / Red' })
  @IsOptional() @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'TSHIRT-L-RED' })
  @IsOptional() @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: 39.99, nullable: true })
  @IsOptional() @Type(() => Number) @IsNumber()
  price?: number | null;

  @ApiPropertyOptional({ example: { size: 'L', color: 'Red' } })
  @IsOptional() @IsObject()
  attributes?: Record<string, string>;

  @ApiPropertyOptional({ example: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
