import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// Tải cấu hình môi trường từ file .env.rls.local (nếu có)
function loadRlsEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env.rls.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

loadRlsEnv();

export const DEV_SUPABASE_URL =
  process.env.VITE_DEV_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';

export const DEV_ANON_KEY =
  process.env.VITE_DEV_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

export const DEV_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export let anonClient: SupabaseClient;
export let userAClient: SupabaseClient;
export let userBClient: SupabaseClient;
export let serviceClient: SupabaseClient;

export let userAId = '';
export let userBId = '';
export let userAEmail = '';
export let userBEmail = '';

const TEST_PASSWORD = 'RlsTestPassword123!@#';

/**
 * Kiểm tra xem môi trường DEV đã sẵn sàng để chạy RLS test suite chưa.
 */
export function isRlsTestConfigured(): boolean {
  return Boolean(
    DEV_SUPABASE_URL && DEV_ANON_KEY && DEV_SERVICE_ROLE_KEY && DEV_SUPABASE_URL.startsWith('http'),
  );
}

/**
 * Khởi tạo 4 context clients và 2 test users trên project DEV.
 */
export async function setupRlsTestContext(): Promise<void> {
  if (!isRlsTestConfigured()) {
    console.warn(
      '\n⚠️ [RLS TEST SKIPPED] Chưa cấu hình .env.rls.local với đầy đủ SUPABASE_SERVICE_ROLE_KEY. Vui lòng xem tests/rls/README.md.\n',
    );
    return;
  }

  // 1. Khởi tạo Service Client và Anon Client
  serviceClient = createClient(DEV_SUPABASE_URL, DEV_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  anonClient = createClient(DEV_SUPABASE_URL, DEV_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  userAClient = createClient(DEV_SUPABASE_URL, DEV_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  userBClient = createClient(DEV_SUPABASE_URL, DEV_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 2. Tạo 2 User Test ngẫu nhiên
  const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  userAEmail = `rls-test-user-a-${uniqueSuffix}@playfusion.test`;
  userBEmail = `rls-test-user-b-${uniqueSuffix}@playfusion.test`;

  const { data: userARes, error: errA } = await serviceClient.auth.admin.createUser({
    email: userAEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `RLS Test User A ${uniqueSuffix}` },
  });
  if (errA || !userARes.user) {
    throw new Error(`Không thể khởi tạo User A cho test suite: ${errA?.message}`);
  }
  userAId = userARes.user.id;

  const { data: userBRes, error: errB } = await serviceClient.auth.admin.createUser({
    email: userBEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `RLS Test User B ${uniqueSuffix}` },
  });
  if (errB || !userBRes.user) {
    throw new Error(`Không thể khởi tạo User B cho test suite: ${errB?.message}`);
  }
  userBId = userBRes.user.id;

  // 3. Đăng nhập 2 authenticated clients
  const { error: signInErrA } = await userAClient.auth.signInWithPassword({
    email: userAEmail,
    password: TEST_PASSWORD,
  });
  if (signInErrA) {
    throw new Error(`User A đăng nhập thất bại: ${signInErrA.message}`);
  }

  const { error: signInErrB } = await userBClient.auth.signInWithPassword({
    email: userBEmail,
    password: TEST_PASSWORD,
  });
  if (signInErrB) {
    throw new Error(`User B đăng nhập thất bại: ${signInErrB.message}`);
  }
}

/**
 * Dọn sạch 2 test users sau khi hoàn thành test suite.
 */
export async function teardownRlsTestContext(): Promise<void> {
  if (!isRlsTestConfigured() || !serviceClient) {
    return;
  }

  try {
    if (userAId) {
      await serviceClient.auth.admin.deleteUser(userAId);
    }
    if (userBId) {
      await serviceClient.auth.admin.deleteUser(userBId);
    }
  } catch (err) {
    console.error('Lỗi khi dọn dẹp user test:', err);
  }
}

export const cleanupRlsTestContext = teardownRlsTestContext;

/**
 * Helper khẳng định một thao tác cơ sở dữ liệu BỊ CHẶN bởi RLS / Permission / Trigger.
 */
export async function expectRlsBlocked<T>(
  operation: Promise<{ data: T | null; error: unknown; count?: number | null }>,
): Promise<void> {
  const result = await operation;

  // 1. PostgREST trả về error (mã 42501 permission denied, trigger exception, WITH CHECK violation...)
  if (result.error) {
    return; // Đã chặn thành công!
  }

  // 2. Lệnh UPDATE/DELETE/SELECT không tìm thấy dòng nào hoặc trả về mảng rỗng do policy USING lọc
  if (Array.isArray(result.data) && result.data.length === 0) {
    return; // Đã chặn thành công!
  }

  if (result.data === null) {
    return; // Đã chặn thành công!
  }

  throw new Error(
    `Kỳ vọng thao tác bị chặn bởi RLS nhưng lại thành công: ${JSON.stringify(result.data)}`,
  );
}
