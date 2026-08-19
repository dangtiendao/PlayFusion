import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  isRlsTestConfigured,
  setupRlsTestContext,
  teardownRlsTestContext,
  userAClient,
  userAId,
  userBId,
  expectRlsBlocked,
} from './setup';

describe('RLS Security Suite: Hồ Sơ Người Chơi (profiles)', () => {
  beforeAll(async () => {
    await setupRlsTestContext();
  });

  afterAll(async () => {
    await teardownRlsTestContext();
  });

  it('[Ma trận: profiles -> UPDATE (own display_name)] userA đổi tên hiển thị của mình -> THÀNH CÔNG', async () => {
    if (!isRlsTestConfigured()) return;

    const newName = 'Player-A-Renamed';
    const { data, error } = await userAClient
      .from('profiles')
      .update({ display_name: newName })
      .eq('user_id', userAId)
      .select('display_name')
      .single();

    expect(error).toBeNull();
    expect(data?.display_name).toBe(newName);
  });

  it('[Ma trận: profiles -> UPDATE (other user)] userA KHÔNG THỂ sửa hồ sơ của userB', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('profiles')
        .update({ display_name: 'Hacked-Name' })
        .eq('user_id', userBId)
        .select(),
    );
  });

  it('[Ma trận: profiles -> UPDATE (role escalation)] userA KHÔNG THỂ tự phong admin cho chính mình', async () => {
    if (!isRlsTestConfigured()) return;

    // Cố tình update role = 'admin' (kể cả khi kèm display_name hợp lệ)
    await expectRlsBlocked(
      userAClient
        .from('profiles')
        .update({
          role: 'admin',
          display_name: 'Admin-A',
        })
        .eq('user_id', userAId)
        .select(),
    );
  });

  it('[Ma trận: profiles -> UPDATE (is_anonymous)] userA KHÔNG THỂ tự ý đổi is_anonymous = false từ client', async () => {
    if (!isRlsTestConfigured()) return;

    await expectRlsBlocked(
      userAClient
        .from('profiles')
        .update({
          is_anonymous: false,
        })
        .eq('user_id', userAId)
        .select(),
    );
  });

  it('[Ma trận: profiles -> INSERT / DELETE] userA KHÔNG THỂ tự insert hoặc delete hồ sơ profiles', async () => {
    if (!isRlsTestConfigured()) return;

    // Cấm INSERT
    await expectRlsBlocked(
      userAClient
        .from('profiles')
        .insert({
          user_id: userAId,
          display_name: 'Clone-User',
        })
        .select(),
    );

    // Cấm DELETE
    await expectRlsBlocked(userAClient.from('profiles').delete().eq('user_id', userAId).select());
  });

  it('[Ma trận: profiles -> SELECT] userA xem được hồ sơ của userB công khai', async () => {
    if (!isRlsTestConfigured()) return;

    const { data, error } = await userAClient
      .from('profiles')
      .select('user_id, display_name, avatar_url, role')
      .eq('user_id', userBId)
      .single();

    expect(error).toBeNull();
    expect(data?.user_id).toBe(userBId);
  });
});
