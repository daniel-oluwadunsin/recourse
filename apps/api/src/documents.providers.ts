import { Inject, Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import PDFDocument from 'pdfkit';
import { AppError } from './common';
import { Environment } from './config';
import type { FormalLetter } from '@recourse/shared';

export interface StoredAsset {
  publicId: string;
  assetId: string | null;
  resourceType: 'image' | 'raw';
  format: string | null;
  bytes: number;
  deliveryType: 'authenticated';
}

@Injectable()
export class CloudinaryService {
  private readonly configured: boolean;

  constructor(@Inject(Environment) private readonly environment: Environment) {
    this.configured = Boolean(
      environment.CLOUDINARY_CLOUD_NAME &&
      environment.CLOUDINARY_API_KEY &&
      environment.CLOUDINARY_API_SECRET,
    );
    if (this.configured) {
      cloudinary.config({
        cloud_name: environment.CLOUDINARY_CLOUD_NAME,
        api_key: environment.CLOUDINARY_API_KEY,
        api_secret: environment.CLOUDINARY_API_SECRET,
        signature_algorithm: 'sha256',
        secure: true,
      });
    }
  }

  async upload(
    bytes: Buffer,
    publicId: string,
    resourceType: 'image' | 'raw',
  ): Promise<StoredAsset> {
    this.assertConfigured();
    try {
      const result = await new Promise<Record<string, unknown>>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              public_id: publicId,
              resource_type: resourceType,
              type: 'authenticated',
              overwrite: false,
              invalidate: true,
            },
            (error, response) =>
              error ? reject(error) : resolve(response ?? {}),
          );
          Readable.from(bytes).pipe(stream);
        },
      );
      if (
        typeof result.public_id !== 'string' ||
        typeof result.bytes !== 'number'
      ) {
        throw new Error('Incomplete Cloudinary response');
      }
      return {
        publicId: result.public_id,
        assetId: typeof result.asset_id === 'string' ? result.asset_id : null,
        resourceType,
        format: typeof result.format === 'string' ? result.format : null,
        bytes: result.bytes,
        deliveryType: 'authenticated',
      };
    } catch {
      throw new AppError(
        'UPLOAD_FAILED',
        'The file could not be stored. Try the upload again.',
        503,
        true,
      );
    }
  }

  async download(asset: StoredAsset): Promise<Buffer> {
    this.assertConfigured();
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const url = cloudinary.utils.private_download_url(
      asset.publicId,
      asset.format ?? '',
      {
        resource_type: asset.resourceType,
        type: 'authenticated',
        expires_at: expiresAt,
        attachment: false,
      },
    );
    const response = await fetch(url);
    if (!response.ok)
      throw new AppError(
        'DOWNLOAD_FAILED',
        'The file is temporarily unavailable.',
        503,
        true,
      );
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(asset: StoredAsset): Promise<void> {
    this.assertConfigured();
    try {
      const result = (await cloudinary.uploader.destroy(asset.publicId, {
        resource_type: asset.resourceType,
        type: 'authenticated',
        invalidate: true,
      })) as { result?: string };
      if (result.result !== 'ok' && result.result !== 'not found')
        throw new Error('delete not confirmed');
    } catch {
      throw new AppError(
        'DELETE_FAILED',
        'The file could not be permanently deleted yet. Nothing else was removed.',
        503,
        true,
      );
    }
  }

  async ping(): Promise<boolean> {
    this.assertConfigured();
    await cloudinary.api.ping();
    return true;
  }

  private assertConfigured(): void {
    if (!this.configured)
      throw new AppError(
        'STORAGE_NOT_CONFIGURED',
        'File storage is not configured.',
        503,
        true,
      );
  }
}

@Injectable()
export class DocumentExtractionService {
  async extract(
    bytes: Buffer,
    mimeType: string,
  ): Promise<{ text: string; pageCount: number | null }> {
    if (mimeType === 'text/plain')
      return { text: bytes.toString('utf8'), pageCount: null };
    if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const result = await mammoth.extractRawText({ buffer: bytes });
      return { text: result.value, pageCount: null };
    }
    if (mimeType === 'application/pdf') {
      const parser = new PDFParse({ data: bytes });
      try {
        const result = await parser.getText();
        return { text: result.text, pageCount: result.total };
      } finally {
        await parser.destroy();
      }
    }
    return { text: '', pageCount: null };
  }
}

@Injectable()
export class LetterPdfService {
  render(letter: FormalLetter): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        margin: 64,
        info: { Title: letter.subject },
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      document.font('Helvetica').fontSize(10.5).fillColor('#202020');
      document.text(letter.sender, { align: 'right' });
      document.moveDown(0.7).text(letter.date, { align: 'right' });
      document.moveDown(1.7).text(letter.recipient);
      if (letter.reference)
        document.moveDown(0.6).text(`Reference: ${letter.reference}`);
      document
        .moveDown(1.4)
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(letter.subject);
      document
        .moveDown(1.2)
        .font('Helvetica')
        .fontSize(10.5)
        .text(letter.salutation);
      for (const paragraph of letter.paragraphs) {
        document
          .moveDown(0.9)
          .text(paragraph, { align: 'justify', lineGap: 2 });
      }
      document.moveDown(1.2).text(letter.closing);
      document.moveDown(1.8).text(letter.signatory);
      if (letter.suggestedAttachments.length) {
        document
          .moveDown(2)
          .font('Helvetica-Bold')
          .text('Suggested attachments');
        document.font('Helvetica');
        for (const attachment of letter.suggestedAttachments)
          document.text(`• ${attachment}`);
      }
      document.end();
    });
  }
}
