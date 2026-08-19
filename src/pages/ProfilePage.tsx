import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { audioManager } from '@/core/audio';
import { hapticTap, hapticSuccess, hapticError } from '@/core/haptics';
import { getAllGames } from '@/games/registry';
import { hasGameData, getStats } from '@/core/gameLocalData';
import { ConfirmDialog } from '@/components/game-shell/ConfirmDialog';
import { getGames } from '@/repositories/catalogRepository';
import { useSyncOutboxCount } from '@/core/syncOutbox';

/**
 * ==============================================================================
 * TRANG HỒ SƠ CÁ NHÂN (PROFILE PAGE - P2.1c)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. QUẢN LÝ HỒ SƠ NGƯỜI DÙNG:
 *    - Tích hợp `authStore` đồng bộ hồ sơ `Profile` từ Supabase.
 *    - PlayerBadge tối giản (P2.1c — Component PlayerBadge chính thức chuẩn hóa tại P6.1).
 *    - Đổi tên hiển thị có kiểm định độ dài (2..20 ký tự) phía client mirror theo DB.
 * 2. ĐĂNG NHẬP / NÂNG CẤP GOOGLE BẢO TOÀN USER ID:
 *    - Khách ẩn danh được khuyến khích liên kết Google qua `linkGoogleToAnonymous`.
 * 3. THỐNG KÊ OFFLINE CỤC BỘ:
 *    - Đọc từ `gameLocalData` theo registry (chuẩn bị cho cloud sync tại P2.5 & P2.6).
 * ==============================================================================
 */

export function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const authStatus = useAuthStore((state) => state.status);
  const updateDisplayName = useAuthStore((state) => state.updateDisplayName);
  const linkGoogle = useAuthStore((state) => state.linkGoogle);
  const authSignOut = useAuthStore((state) => state.signOut);

  // State đổi tên hiển thị
  const currentDisplayName = profile?.displayName || user?.displayName || '';
  const [nameInput, setNameInput] = useState<string>('');
  const [isUpdatingName, setIsUpdatingName] = useState<boolean>(false);
  const [nameSuccessMessage, setNameSuccessMessage] = useState<string | null>(null);
  const [nameErrorMessage, setNameErrorMessage] = useState<string | null>(null);

  // State đăng nhập Google & Đăng xuất
  const [isLinkingGoogle, setIsLinkingGoogle] = useState<boolean>(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState<boolean>(false);

  // Kiểm chứng P2.5a — P2.6 làm thống kê online thật
  const [onlineGamesCount, setOnlineGamesCount] = useState<number | null>(null);

  // Số lượng ván đấu đang chờ đồng bộ Outbox (P2.5c)
  const pendingSyncCount = useSyncOutboxCount();

  useEffect(() => {
    let isMounted = true;
    getGames()
      .then((games) => {
        if (isMounted) {
          setOnlineGamesCount(games.length);
        }
      })
      .catch(() => {
        // Bỏ qua lỗi kết nối ở bước hiển thị phụ trợ
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Đồng bộ nameInput khi profile load xong
  useEffect(() => {
    if (currentDisplayName) {
      setNameInput(currentDisplayName);
    }
  }, [currentDisplayName]);

  // Thống kê thành tích offline trên thiết bị này
  const gameStatsList = useMemo(() => {
    return getAllGames()
      .filter((g) => hasGameData(g.definition.id))
      .map((g) => ({
        game: g,
        stats: getStats(g.definition.id),
      }));
  }, []);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();

    if (!trimmed || trimmed.length < 2 || trimmed.length > 20) {
      setNameErrorMessage('Tên hiển thị phải có độ dài từ 2 đến 20 ký tự.');
      hapticError();
      audioManager.playSfx('error');
      return;
    }

    setIsUpdatingName(true);
    setNameErrorMessage(null);
    setNameSuccessMessage(null);

    try {
      await updateDisplayName(trimmed);
      setNameSuccessMessage('Cập nhật tên hiển thị thành công!');
      hapticSuccess();
      audioManager.playSfx('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể cập nhật tên hiển thị.';
      setNameErrorMessage(msg);
      hapticError();
      audioManager.playSfx('error');
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsLinkingGoogle(true);
    try {
      await linkGoogle();
    } catch {
      // Error được quản lý trong store
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  const handleSignOutConfirm = async () => {
    setShowSignOutConfirm(false);
    try {
      await authSignOut();
      hapticTap();
      audioManager.playSfx('click');
    } catch {
      // Error trong store
    }
  };

  const displayName =
    profile?.displayName ||
    user?.displayName ||
    (user?.isAnonymous ? 'Người chơi khách' : 'Người chơi');
  const avatarUrl = profile?.avatarUrl || user?.avatarUrl;
  const isAnonymous = user?.isAnonymous ?? true;

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-8">
      {/* 1. TIÊU ĐỀ TRANG */}
      <section className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
          <span>👤 Thông Tin Tài Khoản</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Hồ Sơ Cá Nhân
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Quản lý tên người chơi, kết nối Google và xem thành tích offline.
        </p>
      </section>

      {/* 2. KHỐI THÔNG TIN TÀI KHOẢN (PLAYER BADGE TỐI GIẢN P2.1c) */}
      <section
        data-testid="profile-card"
        className="bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border p-5 shadow-sm space-y-4"
      >
        <div className="flex items-center gap-4">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-primary-400 dark:border-primary-600 shadow-sm flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white flex items-center justify-center text-2xl font-black shadow-sm flex-shrink-0">
              {isAnonymous ? '👤' : displayName.charAt(0).toUpperCase() || 'P'}
            </div>
          )}

          <div className="space-y-1 overflow-hidden">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                data-testid="profile-display-name"
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate"
              >
                {displayName}
              </h3>
              <span
                data-testid="profile-status-badge"
                className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                  isAnonymous
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                }`}
              >
                {isAnonymous ? 'Khách (Ẩn danh)' : 'Google Account'}
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
              ID: {user ? `${user.id.slice(0, 8)}...${user.id.slice(-4)}` : 'Đang tải...'}
            </p>

            {user?.email && (
              <p className="text-xs text-slate-600 dark:text-slate-300 truncate">✉️ {user.email}</p>
            )}
          </div>
        </div>
      </section>

      {/* 3. KHỐI ĐỔI TÊN HIỂN THỊ */}
      <section className="bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border p-5 shadow-sm space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Đổi Tên Hiển Thị</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tên này sẽ hiển thị trên bảng xếp hạng và các ván đấu (2 - 20 ký tự)
          </p>
        </div>

        <form onSubmit={handleUpdateName} className="space-y-3">
          <div className="relative">
            <input
              type="text"
              data-testid="display-name-input"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setNameErrorMessage(null);
                setNameSuccessMessage(null);
              }}
              maxLength={20}
              placeholder="Nhập tên hiển thị mới..."
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-surface-muted dark:bg-surface-dark-muted border border-surface-border dark:border-surface-dark-border text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <span className="absolute right-3 top-3 text-[11px] font-mono text-slate-400">
              {nameInput.trim().length}/20
            </span>
          </div>

          {nameSuccessMessage && (
            <div
              data-testid="name-success-banner"
              className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 font-medium"
            >
              ✅ {nameSuccessMessage}
            </div>
          )}

          {nameErrorMessage && (
            <div
              data-testid="name-error-banner"
              className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium"
            >
              ⚠️ {nameErrorMessage}
            </div>
          )}

          <button
            type="submit"
            data-testid="save-name-btn"
            disabled={
              isUpdatingName || !nameInput.trim() || nameInput.trim() === currentDisplayName
            }
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-semibold text-xs sm:text-sm shadow-sm transition-all disabled:opacity-50 active:scale-95"
          >
            {isUpdatingName ? 'Đang lưu tên mới...' : 'Lưu Thay Đổi'}
          </button>
        </form>
      </section>

      {/* 4. KHỐI LIÊN KẾT / ĐĂNG NHẬP GOOGLE */}
      <section className="bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border p-5 shadow-sm space-y-3">
        {isAnonymous ? (
          <div data-testid="google-upgrade-banner" className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🌐</span>
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Đăng Nhập Tài Khoản Google
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Đăng nhập để giữ nguyên dữ liệu hồ sơ và thành tích khi đổi thiết bị.
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="google-signin-btn"
              onClick={handleGoogleAuth}
              disabled={isLinkingGoogle || authStatus === 'loading'}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-semibold text-xs sm:text-sm shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <span>🌐</span>
              <span>{isLinkingGoogle ? 'Đang chuyển hướng OAuth...' : 'Đăng Nhập Với Google'}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Tài Khoản Đã Xác Thực
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Đã liên kết với Google:{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {user?.email}
                </span>
              </p>
            </div>

            <button
              type="button"
              data-testid="profile-sign-out-btn"
              onClick={() => setShowSignOutConfirm(true)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-semibold text-xs transition-all active:scale-95"
            >
              Đăng xuất
            </button>
          </div>
        )}
      </section>

      {/* 5. KHỐI THÀNH TÍCH TRÊN THIẾT BỊ NÀY (OFFLINE LOCAL DATA) */}
      <section className="bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border p-5 shadow-sm space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            🏆 Thành Tích Trên Thiết Bị Này
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Dữ liệu thống kê kết quả các ván đấu cục bộ đã chơi
          </p>
        </div>

        {gameStatsList.length > 0 ? (
          <div className="space-y-2.5">
            {gameStatsList.map(({ game, stats }) => (
              <div
                key={game.definition.id}
                data-testid={`stats-card-${game.definition.id}`}
                className="p-3.5 rounded-xl bg-surface-muted dark:bg-surface-dark-muted border border-surface-border/60 dark:border-surface-dark-border/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{game.definition.icon ?? '🎮'}</span>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      {game.definition.name}
                    </h4>
                  </div>
                  <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">
                    {stats.totalMatches} ván đã đấu
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="p-2 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border/40 dark:border-surface-dark-border/40">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Thắng</div>
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {stats.wins}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border/40 dark:border-surface-dark-border/40">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Tỷ lệ thắng
                    </div>
                    <div className="text-xs font-bold text-primary-600 dark:text-primary-400">
                      {stats.totalMatches > 0
                        ? Math.round((stats.wins / stats.totalMatches) * 100)
                        : 0}
                      %
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border/40 dark:border-surface-dark-border/40">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Chuỗi cao nhất
                    </div>
                    <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      {stats.bestStreak} 🔥
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-surface-muted dark:bg-surface-dark-muted border border-surface-border/60 dark:border-surface-dark-border/60 text-center space-y-1">
            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
              Hiện chưa có ván đấu nào được hoàn thành trên thiết bị này.
            </p>
          </div>
        )}

        {/* Chỉ báo đồng bộ Outbox (P2.5c) */}
        {pendingSyncCount > 0 && (
          <div
            data-testid="sync-pending-badge"
            className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300"
          >
            <span>⏳</span>
            <span>Chờ đồng bộ: {pendingSyncCount} trận</span>
          </div>
        )}

        {/* Kiểm chứng P2.5a — P2.6 làm thống kê online thật */}
        {onlineGamesCount !== null && (
          <div
            data-testid="server-connection-status"
            className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 pt-1"
          >
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Đã kết nối máy chủ: {onlineGamesCount} trò chơi khả dụng</span>
          </div>
        )}

        <p className="text-[11px] text-slate-400 dark:text-slate-500 italic text-center pt-1">
          📊 Thống kê và bảng xếp hạng trực tuyến toàn cầu sẽ khả dụng trong bản cập nhật sau
          (P2.6).
        </p>
      </section>

      {/* Dialog xác nhận đăng xuất */}
      {showSignOutConfirm && (
        <ConfirmDialog
          isOpen={true}
          title="Xác nhận đăng xuất?"
          message={
            isAnonymous
              ? 'Đăng xuất tài khoản khách sẽ tạo một tài khoản mới. Dữ liệu của tài khoản này có thể không khôi phục được trừ khi đã liên kết Google.'
              : 'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản Google này?'
          }
          confirmText="Đăng xuất"
          cancelText="Hủy"
          onConfirm={handleSignOutConfirm}
          onCancel={() => setShowSignOutConfirm(false)}
        />
      )}
    </div>
  );
}

export default ProfilePage;
