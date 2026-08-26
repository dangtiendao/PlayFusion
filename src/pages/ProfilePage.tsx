import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { audioManager } from '@/core/audio';
import { hapticTap, hapticSuccess, hapticError } from '@/core/haptics';
import { getAllGames } from '@/games/registry';
import { hasGameData, getStats } from '@/core/gameLocalData';
import { ConfirmDialog } from '@/components/game-shell/ConfirmDialog';
import { useSyncOutboxCount } from '@/core/syncOutbox';
import { getMyGameStats } from '@/repositories/statsRepository';
import { getMyRecentMatches } from '@/repositories/matchRepository';
import { walletRepository } from '@/repositories/walletRepository';
import { seasonRepository } from '@/repositories/seasonRepository';
import { getActiveSeason } from '@/repositories/catalogRepository';
import type {
  PlayerGameStats,
  MatchSummary,
  SeasonBadge,
  Season,
  RecentDecayLog,
} from '@/repositories/types';
import { StatsSummary } from '@/components/stats/StatsSummary';
import { GameStatCard } from '@/components/stats/GameStatCard';
import { MatchHistoryList } from '@/components/stats/MatchHistoryList';
import { ActiveMatchBanner } from '@/components/ActiveMatchBanner';
import { RankCard, useMyRankViews } from '@/components/rank';
import { SeasonBadgesSection, NewSeasonBanner } from '@/components/season';

/**
 * ==============================================================================
 * TRANG HỒ SƠ CÁ NHÂN & THỐNG KÊ (PROFILE PAGE - P2.6c)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. ĐỈNH CAO KIẾN TRÚC PLUGIN (DoD GỐC P2.6):
 *    - Danh sách GameStatCard ĐƯỢC RENDER VÒNG LẶP TRỰC TIẾP TỪ REGISTRY (`getAllGames()`).
 *    - TUYỆT ĐỐI KHÔNG lọc, liệt kê hay hard-code tên game trong component này.
 *    - Khi thêm game mới vào Registry, thẻ thống kê của game đó TỰ ĐỘNG XUẤT HIỆN.
 * 2. NGUYÊN TẮC OFFLINE-FIRST:
 *    - Mặc định tải thống kê đa thiết bị từ Cloud (`statsRepository`, `matchRepository`).
 *    - Khi mất mạng hoặc lỗi kết nối, hiển thị banner cảnh báo nhẹ nhàng kèm nút thử lại,
 *      đồng thời VẪN HIỂN THỊ mục "Thành tích trên máy này" (Local Data) không bị gián đoạn.
 * 3. TỰ ĐỘNG LÀM MỚI KHI ĐỒNG BỘ XONG (OUTBOX REACTIVE REFRESH):
 *    - Khi `pendingSyncCount` chuyển từ >0 về 0 (các trận offline vừa được đẩy lên cloud),
 *      hồ sơ tự động gọi lại `fetchCloudData` để cập nhật số liệu mới nhất.
 * ==============================================================================
 */

export function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const authStatus = useAuthStore((state) => state.status);
  const authError = useAuthStore((state) => state.error);
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

  // State dữ liệu Cloud Stats & Lịch sử trận đấu & Số dư Ví
  const [cloudStats, setCloudStats] = useState<PlayerGameStats[]>([]);
  const [recentMatches, setRecentMatches] = useState<MatchSummary[]>([]);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [isLoadingCloud, setIsLoadingCloud] = useState<boolean>(true);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // State huy hiệu mùa & mùa active & decay logs (P4.6d)
  const [seasonBadges, setSeasonBadges] = useState<SeasonBadge[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [decayLogs, setDecayLogs] = useState<Record<string, RecentDecayLog>>({});
  const [isLoadingBadges, setIsLoadingBadges] = useState<boolean>(true);

  // Dữ liệu Rank Views cho từng game ranked (P4.3b)
  const { rankViews, isLoading: isLoadingRank, error: rankError } = useMyRankViews();

  // State đóng/mở khối thành tích cục bộ (Collapsible local stats)
  const [isLocalStatsOpen, setIsLocalStatsOpen] = useState<boolean>(false);

  // Số lượng ván đấu đang chờ đồng bộ Outbox (P2.5c)
  const pendingSyncCount = useSyncOutboxCount();

  // Registry danh sách trò chơi (Single Source of Truth)
  const allRegisteredGames = useMemo(() => getAllGames(), []);

  // Map resolver gameId -> gameName tiếng Việt
  const getGameName = useCallback(
    (gameId: string) => {
      const match = allRegisteredGames.find((g) => g.definition.id === gameId);
      return match ? match.definition.name : gameId;
    },
    [allRegisteredGames],
  );

  // Hàm tải dữ liệu thống kê, lịch sử, ví và huy hiệu mùa từ Cloud (Song song Promise.all)
  const fetchCloudData = useCallback(async () => {
    if (!user) {
      setCloudStats([]);
      setRecentMatches([]);
      setWalletBalance(0);
      setSeasonBadges([]);
      setActiveSeason(null);
      setDecayLogs({});
      setIsLoadingCloud(false);
      setIsLoadingBadges(false);
      return;
    }

    setIsLoadingCloud(true);
    setIsLoadingBadges(true);
    setCloudError(null);

    try {
      const [statsData, matchesData, bal, badges, currentSeason] = await Promise.all([
        getMyGameStats(),
        getMyRecentMatches(undefined, 10),
        walletRepository.getMyBalance().catch(() => 0),
        seasonRepository.getMySeasonBadges().catch(() => []),
        getActiveSeason().catch(() => null),
      ]);
      setCloudStats(statsData);
      setRecentMatches(matchesData);
      setWalletBalance(bal);
      setSeasonBadges(badges);
      setActiveSeason(currentSeason);

      // Tải decay log cho các game ranked
      const rankedGameIds = allRegisteredGames
        .filter((g) => g.definition.ranked)
        .map((g) => g.definition.id);

      const decayResults = await Promise.all(
        rankedGameIds.map(async (gId) => {
          const log = await seasonRepository.getMyRecentDecay(gId).catch(() => null);
          return { gId, log };
        }),
      );

      const decayMap: Record<string, RecentDecayLog> = {};
      for (const res of decayResults) {
        if (res.log) {
          decayMap[res.gId] = res.log;
        }
      }
      setDecayLogs(decayMap);
    } catch {
      setCloudError('Không thể kết nối máy chủ để lấy thống kê mới nhất.');
    } finally {
      setIsLoadingCloud(false);
      setIsLoadingBadges(false);
    }
  }, [user, allRegisteredGames]);

  // Tải dữ liệu khi component mount hoặc khi user thay đổi
  useEffect(() => {
    fetchCloudData();
  }, [fetchCloudData]);

  // Tự động làm mới dữ liệu khi hàng đợi Outbox vừa hoàn tất đồng bộ (pendingCount về 0)
  const [prevPendingCount, setPrevPendingCount] = useState<number>(pendingSyncCount);
  useEffect(() => {
    if (prevPendingCount > 0 && pendingSyncCount === 0) {
      fetchCloudData();
    }
    setPrevPendingCount(pendingSyncCount);
  }, [pendingSyncCount, prevPendingCount, fetchCloudData]);

  // Đồng bộ nameInput khi profile load xong
  useEffect(() => {
    if (currentDisplayName) {
      setNameInput(currentDisplayName);
    }
  }, [currentDisplayName]);

  // Map gameId -> PlayerGameStats để tra cứu nhanh khi render vòng lặp
  const cloudStatsMap = useMemo(() => {
    const map = new Map<string, PlayerGameStats>();
    for (const stat of cloudStats) {
      map.set(stat.gameId, stat);
    }
    return map;
  }, [cloudStats]);

  // Thống kê thành tích offline trên thiết bị này (Local Storage)
  const gameStatsList = useMemo(() => {
    return allRegisteredGames
      .filter((g) => hasGameData(g.definition.id))
      .map((g) => ({
        game: g,
        stats: getStats(g.definition.id),
      }));
  }, [allRegisteredGames]);

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
      await linkGoogle({
        redirectTo: typeof window !== 'undefined' ? window.location.origin + '/profile' : undefined,
      });
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
      {/* BANNER TRẬN ĐẤU DỞ DANG (P3.5b) */}
      <ActiveMatchBanner />

      {/* BANNER THÔNG BÁO MÙA GIẢI MỚI (P4.6d) */}
      <NewSeasonBanner activeSeason={activeSeason} />

      {/* 1. TIÊU ĐỀ TRANG */}
      <section className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300 border border-primary-200 dark:border-primary-800">
          <span>👤 Thông Tin Cá Nhân</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Hồ Sơ & Thống Kê
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Tổng hợp thành tích thi đấu, lịch sử trận và quản lý tài khoản.
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

        {/* CHỈ BÁO ĐỒNG BỘ OUTBOX (P2.5c) */}
        {pendingSyncCount > 0 && (
          <div
            data-testid="sync-pending-badge"
            className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-semibold text-amber-800 dark:text-amber-300"
          >
            <span>⏳</span>
            <span>Chờ đồng bộ: {pendingSyncCount} trận</span>
          </div>
        )}
      </section>

      {/* 2b. NÚT VÍ CỦA TÔI & ĐIỂM DANH (PHASE P4.5c) */}
      <section>
        <button
          type="button"
          data-testid="profile-wallet-btn"
          onClick={() => {
            hapticTap();
            audioManager.playSfx('click');
            navigate('/wallet');
          }}
          className="w-full p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/10 hover:from-amber-500/20 hover:to-yellow-500/20 border border-amber-500/30 transition-all flex items-center justify-between shadow-sm active:scale-[0.99] group text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl shadow-inner group-hover:scale-105 transition-transform">
              🪙
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Ví Của Tôi</h4>
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  Điểm danh nhận xu
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Số dư:{' '}
                <strong className="text-amber-600 dark:text-amber-400 font-mono font-bold">
                  {walletBalance.toLocaleString('vi-VN')} xu
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 text-slate-400 group-hover:text-amber-500 transition-colors text-xs font-bold pr-1">
            <span>Xem ví</span>
            <span>→</span>
          </div>
        </button>
      </section>

      {/* 3. KHỐI TỔNG QUAN THỐNG KÊ (STATSSUMMARY) */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          📊 Tổng Quan Thành Tích
        </h3>

        {cloudError && (
          <div
            data-testid="cloud-error-banner"
            className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300"
          >
            <span>⚠️ {cloudError}</span>
            <button
              type="button"
              onClick={fetchCloudData}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px]"
            >
              Thử lại
            </button>
          </div>
        )}

        <StatsSummary allStats={cloudStats} getGameName={getGameName} isLoading={isLoadingCloud} />
      </section>

      {/* 4. DANH SÁCH THẺ THỐNG KÊ TỪNG GAME (VÒNG LẶP REGISTRY - ĐIỂM QUYẾT ĐỊNH DoD P2.6) */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          🎮 Chi Tiết Từng Trò Chơi
        </h3>

        <div className="space-y-4" data-testid="games-stat-list">
          {allRegisteredGames.map((game) => (
            <div key={game.definition.id} className="space-y-3">
              {/* Thẻ Rank (Chỉ hiển thị cho game có ranked=true, ẩn nhẹ khi lỗi mạng theo nguyên tắc Offline-First) */}
              {game.definition.ranked && !rankError && (
                <RankCard
                  definition={game.definition}
                  rankView={rankViews[game.definition.id] ?? null}
                  decayInfo={decayLogs[game.definition.id] ?? null}
                  onPlay={() => navigate(`/game/${game.definition.id}`)}
                  isLoading={isLoadingRank}
                />
              )}

              {/* Thẻ Thống Kê Thành Tích Thắng/Thua/Chuỗi */}
              <GameStatCard
                definition={game.definition}
                stats={cloudStatsMap.get(game.definition.id) ?? null}
                onPlay={() => navigate(`/game/${game.definition.id}`)}
                isLoading={isLoadingCloud}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 4b. KHỐI KỶ VẬT & HUY HIỆU MÙA GIẢI (P4.6d) */}
      <SeasonBadgesSection
        badges={seasonBadges}
        getGameName={getGameName}
        isLoading={isLoadingBadges}
      />

      {/* 5. LỊCH SỬ VÁN ĐẤU GẦN ĐÂY (MATCH HISTORY LIST) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            📜 Trận Gần Đây
          </h3>
          <span className="text-xs text-slate-400">10 trận mới nhất</span>
        </div>

        <MatchHistoryList
          matches={recentMatches}
          myUserId={user?.id}
          getGameName={getGameName}
          emptyText="Chưa có lịch sử ván đấu trực tuyến nào."
          isLoading={isLoadingCloud}
        />
      </section>

      {/* 6. KHỐI THÀNH TÍCH TRÊN THIẾT BỊ NÀY (COLLAPSIBLE LOCAL STATS) */}
      <section className="bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border p-4 shadow-sm space-y-3">
        <button
          type="button"
          data-testid="toggle-local-stats-btn"
          onClick={() => setIsLocalStatsOpen((prev) => !prev)}
          className="flex items-center justify-between w-full text-left font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <span>📁</span>
            <span>Thành Tích Trên Thiết Bị Này (Offline Local)</span>
          </div>
          <span className="text-xs text-slate-400">{isLocalStatsOpen ? '▲ Đóng' : '▼ Mở'}</span>
        </button>

        {isLocalStatsOpen && (
          <div className="pt-2 space-y-2.5 border-t border-surface-border/60 dark:border-surface-dark-border/60">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Dữ liệu được lưu trữ cục bộ trên trình duyệt thiết bị này (Local Storage).
            </p>

            {gameStatsList.length > 0 ? (
              <div className="space-y-2">
                {gameStatsList.map(({ game, stats }) => (
                  <div
                    key={game.definition.id}
                    data-testid={`stats-card-${game.definition.id}`}
                    className="p-3 rounded-xl bg-surface-muted dark:bg-surface-dark-muted border border-surface-border/60 dark:border-surface-dark-border/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {game.definition.name}
                      </span>
                      <span className="text-primary-600 dark:text-primary-400 font-semibold">
                        {stats.totalMatches} ván
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
                      <div className="p-1.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border/40">
                        <div className="text-slate-400">Thắng</div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          {stats.wins}
                        </div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border/40">
                        <div className="text-slate-400">Tỷ lệ</div>
                        <div className="font-bold text-primary-600 dark:text-primary-400">
                          {stats.totalMatches > 0
                            ? Math.round((stats.wins / stats.totalMatches) * 100)
                            : 0}
                          %
                        </div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-surface dark:bg-surface-dark border border-surface-border/40">
                        <div className="text-slate-400">Chuỗi</div>
                        <div className="font-bold text-amber-600 dark:text-amber-400">
                          {stats.bestStreak} 🔥
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic text-center py-2">
                Chưa có ván đấu nào lưu trên thiết bị này.
              </p>
            )}
          </div>
        )}
      </section>

      {/* 7. KHỐI ĐỔI TÊN HIỂN THỊ */}
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

      {/* 8. KHỐI LIÊN KẾT / ĐĂNG NHẬP GOOGLE & ĐĂNG XUẤT */}
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
                  Đăng nhập để lưu giữ thành tích và đồng bộ trên mọi thiết bị.
                </p>
              </div>
            </div>

            {authError && (
              <div
                data-testid="google-auth-error-banner"
                className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium"
              >
                ⚠️ {authError}
              </div>
            )}

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
