import { describe, it, expect, beforeEach } from 'vitest';
import { validateEnv, getAppEnv, _resetCachedEnvForTesting } from './env';

describe('Environment Variables Validation Tests (env.ts - P2.1a)', () => {
  beforeEach(() => {
    _resetCachedEnvForTesting();
  });

  it('1. Trả về cấu hình AppEnv hợp lệ khi có đầy đủ biến môi trường', () => {
    const validEnv = {
      VITE_SUPABASE_URL: 'https://test-project.supabase.co/',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key-123456',
      MODE: 'development',
    };

    const result = validateEnv(validEnv);

    expect(result.supabaseUrl).toBe('https://test-project.supabase.co'); // Đã loại bỏ dấu / ở cuối
    expect(result.supabaseAnonKey).toBe('test-anon-key-123456');
    expect(result.isDev).toBe(true);
    expect(result.isProd).toBe(false);
    expect(result.isTest).toBe(false);
  });

  it('2. Nhận diện chính xác môi trường production', () => {
    const prodEnv = {
      VITE_SUPABASE_URL: 'https://prod-project.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'prod-anon-key-789',
      MODE: 'production',
    };

    const result = validateEnv(prodEnv);

    expect(result.isDev).toBe(false);
    expect(result.isProd).toBe(true);
    expect(result.isTest).toBe(false);
  });

  it('3. Fail-Fast: Ném lỗi rõ ràng khi thiếu VITE_SUPABASE_URL', () => {
    const invalidEnv = {
      VITE_SUPABASE_ANON_KEY: 'some-key',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(/VITE_SUPABASE_URL bị thiếu hoặc rỗng/i);
  });

  it('4. Fail-Fast: Ném lỗi khi VITE_SUPABASE_URL sai định dạng (không có https:// hoặc http://)', () => {
    const invalidEnv = {
      VITE_SUPABASE_URL: 'invalid-url-without-protocol',
      VITE_SUPABASE_ANON_KEY: 'some-key',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(/VITE_SUPABASE_URL phải là một URL hợp lệ/i);
  });

  it('5. Fail-Fast: Ném lỗi rõ ràng khi thiếu VITE_SUPABASE_ANON_KEY', () => {
    const invalidEnv = {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
    };

    expect(() => validateEnv(invalidEnv)).toThrowError(
      /VITE_SUPABASE_ANON_KEY bị thiếu hoặc rỗng/i,
    );
  });

  it('6. Fail-Fast: Ném lỗi liệt kê cả 2 biến và hướng dẫn khắc phục khi thiếu tất cả', () => {
    const emptyEnv = {};

    expect(() => validateEnv(emptyEnv)).toThrowError(
      /LỖI KHỞI ĐỘNG - BIẾN MÔI TRƯỜNG SUPABASE KHÔNG HỢP LỆ/i,
    );
    expect(() => validateEnv(emptyEnv)).toThrowError(
      /Sao chép file "\.env\.example" thành "\.env\.local"/i,
    );
  });

  it('7. getAppEnv trả về singleton cấu hình và hoạt động ổn định', () => {
    const env1 = getAppEnv();
    const env2 = getAppEnv();

    expect(env1).toBe(env2);
    expect(env1.supabaseUrl).toBeDefined();
    expect(env1.supabaseAnonKey).toBeDefined();
  });
});
