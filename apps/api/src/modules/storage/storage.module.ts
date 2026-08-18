import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { CloudinaryStorageProvider } from "./cloudinary-storage.provider";
import { STORAGE_PROVIDER } from "./storage.types";

@Module({
  exports: [STORAGE_PROVIDER],
  imports: [ConfigModule],
  providers: [
    CloudinaryStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useExisting: CloudinaryStorageProvider,
    },
  ],
})
export class StorageModule {}
