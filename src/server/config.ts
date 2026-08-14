import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  MEEGO_BASE_URL: z.string().url().default('https://project.feishu.cn'),
  MEEGO_PLUGIN_ID: z.string().min(1),
  MEEGO_PLUGIN_SECRET: z.string().min(1),
  MEEGO_TOKEN_TYPE: z.coerce.number().default(0),
  MEEGO_USER_KEY: z.string().min(1),
  MEEGO_SPACE_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().default('./data/app.db'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ 环境变量校验失败:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\n请复制 .env.example 为 .env 并填写正确值');
  process.exit(1);
}

export const config = {
  meego: {
    baseUrl: parsed.data.MEEGO_BASE_URL,
    pluginId: parsed.data.MEEGO_PLUGIN_ID,
    pluginSecret: parsed.data.MEEGO_PLUGIN_SECRET,
    tokenType: parsed.data.MEEGO_TOKEN_TYPE,
    userKey: parsed.data.MEEGO_USER_KEY,
    spaceKey: parsed.data.MEEGO_SPACE_KEY,
  },
  port: parsed.data.PORT,
  databaseUrl: parsed.data.DATABASE_URL,
} as const;

export type AppConfig = typeof config;
