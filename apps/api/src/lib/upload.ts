import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { badRequest } from './errors';

const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadRoot, { recursive: true });

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(uploadRoot, 'products');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const productImageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!imageTypes.has(file.mimetype)) return cb(badRequest('Only JPG, PNG or WebP images are allowed'));
    cb(null, true);
  },
});

export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(env.MAX_UPLOAD_MB, 10) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/octet-stream' ||
      file.originalname.toLowerCase().endsWith('.xlsx')
    ) {
      return cb(null, true);
    }
    cb(badRequest('Upload an .xlsx workbook'));
  },
});

export function publicFileUrl(file: Express.Multer.File, folder = 'products'): string {
  return `/uploads/${folder}/${file.filename}`;
}
