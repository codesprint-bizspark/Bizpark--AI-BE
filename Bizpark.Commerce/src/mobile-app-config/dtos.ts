import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMobileAppConfigDto {
  @ApiPropertyOptional({ example: 'Kopi Corner' })
  @IsOptional() @IsString()
  businessName?: string;

  @ApiPropertyOptional({ example: 'Your Daily Brew, Made Right' })
  @IsOptional() @IsString()
  tagline?: string | null;

  @ApiPropertyOptional({ example: '#3B1F0E' })
  @IsOptional() @IsString()
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#F5C842' })
  @IsOptional() @IsString()
  accentColor?: string;

  @ApiPropertyOptional({ example: '#FFFDF9' })
  @IsOptional() @IsString()
  backgroundColor?: string;

  @ApiPropertyOptional({ description: 'Full AI-generated mobile app config blob' })
  @IsOptional() @IsObject()
  config?: Record<string, unknown>;
}
