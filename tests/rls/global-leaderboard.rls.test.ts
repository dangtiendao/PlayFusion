/**
 * ==============================================================================
 * RLS & ACCESS GRANTS SUITE: BẢNG XẾP HẠNG TỔNG HỢP (MATERIALIZED VIEWS)
 * (TESTS/RLS/GLOBAL-LEADERBOARD.RLS.TEST.TS)
 * ==============================================================================
 *
 * MỤC TIÊU KIỂM THỬ (PHASE P4.7A):
 * 1. PHÂN QUYỀN MATVIEW:
 *    - userAClient, userBClient (authenticated) SELECT được cả 2 matviews mà không bị lỗi quyền.
 *    - anonClient (khách chưa auth) SELECT vào 2 matviews BỊ CHẶN (error 42501 hoặc permission denied).
 * 2. SERVICE ROLE:
 *    - serviceClient có toàn quyền SELECT vào 2 matviews.
 * ==============================================================================
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isRlsTestConfigured,
  setupRlsTestContext,
  teardownRlsTestContext,
  userAClient,
  userBClient,
  anonClient,
  serviceClient,
} from './setup';

describe.runIf(isRlsTestConfigured())(
  'RLS & Grants Suite: Global Leaderboard Materialized Views (P4.7a)',
  () => {
    beforeAll(async () => {
      await setupRlsTestContext();
    });

    afterAll(async () => {
      await teardownRlsTestContext();
    });

    it('1. [Ma trận: mv_leaderboard_masters -> SELECT (Authenticated)] userA và userB đọc được bảng Cao Thủ', async () => {
      const { data: dataA, error: errA } = await userAClient
        .from('mv_leaderboard_masters')
        .select('*')
        .limit(10);

      expect(errA).toBeNull();
      expect(Array.isArray(dataA)).toBe(true);

      const { data: dataB, error: errB } = await userBClient
        .from('mv_leaderboard_masters')
        .select('*')
        .limit(10);

      expect(errB).toBeNull();
      expect(Array.isArray(dataB)).toBe(true);
    });

    it('2. [Ma trận: mv_leaderboard_grinders -> SELECT (Authenticated)] userA và userB đọc được bảng Chăm Chỉ', async () => {
      const { data: dataA, error: errA } = await userAClient
        .from('mv_leaderboard_grinders')
        .select('*')
        .limit(10);

      expect(errA).toBeNull();
      expect(Array.isArray(dataA)).toBe(true);

      const { data: dataB, error: errB } = await userBClient
        .from('mv_leaderboard_grinders')
        .select('*')
        .limit(10);

      expect(errB).toBeNull();
      expect(Array.isArray(dataB)).toBe(true);
    });

    it('3. [Ma trận: mv_leaderboard_masters -> SELECT (Anon)] anonClient bị chặn khi truy cập bảng Cao Thủ', async () => {
      const { data, error } = await anonClient.from('mv_leaderboard_masters').select('*').limit(10);

      // Kỳ vọng bị chặn bởi PostgreSQL object permissions
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('4. [Ma trận: mv_leaderboard_grinders -> SELECT (Anon)] anonClient bị chặn khi truy cập bảng Chăm Chỉ', async () => {
      const { data, error } = await anonClient
        .from('mv_leaderboard_grinders')
        .select('*')
        .limit(10);

      // Kỳ vọng bị chặn bởi PostgreSQL object permissions
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it('5. [Service Role] serviceClient truy cập toàn quyền vào cả 2 matviews', async () => {
      const { data: masters, error: errMasters } = await serviceClient
        .from('mv_leaderboard_masters')
        .select('*')
        .limit(5);

      expect(errMasters).toBeNull();
      expect(Array.isArray(masters)).toBe(true);

      const { data: grinders, error: errGrinders } = await serviceClient
        .from('mv_leaderboard_grinders')
        .select('*')
        .limit(5);

      expect(errGrinders).toBeNull();
      expect(Array.isArray(grinders)).toBe(true);
    });
  },
);
