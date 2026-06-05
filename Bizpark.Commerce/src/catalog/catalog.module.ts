import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { VariantsController } from './variants.controller';
import { VariantsService } from './variants.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { MediaStorageService } from './media-storage.service';

@Module({
  controllers: [CatalogController, VariantsController, CategoriesController],
  providers: [CatalogService, VariantsService, CategoriesService, MediaStorageService],
  exports: [CatalogService, VariantsService, CategoriesService],
})
export class CatalogModule {}
