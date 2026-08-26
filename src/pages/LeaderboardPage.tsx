import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAllGames } from '@/games/registry';
import { CATEGORY_CONFIGS } from '@/games/labels';
import { getActiveSeason } from '@/repositories/catalogRepository';
import {
  getLeaderboardPage,
  getMyRank,
  MIN_MATCHES_FOR_LEADERBOARD,
} from '@/repositories/leaderboardRepository';
import { LeaderboardList, MyRankFooter } from '@/components/leaderboard';
import { useAuthStore } from '@/stores/authStore';
import type {
  LeaderboardCursor,
  LeaderboardEntry,
  MyLeaderboardRank,
  Season,
} from '@/repositories/types';

/**
 * ==============================================================================
 * TRANG BẢNG XẾP HẠNG (LEADERBOARD PAGE - PHASE P4.4c)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC & NGUYÊN TẮC BẤT BIẾN:
 * 1. NGUỒN CHÂN LÝ DUY NHẤT (REGISTRY-DRIVEN):
 *    - Danh sách tab trò chơi được lọc tự động từ `getAllGames().filter((g) => g.ranked)`.
 *    - TUYỆT ĐỐI KHÔNG hard-code tên bất kỳ trò chơi nào. Khi thêm game mới vào Registry,
 *      tab bảng xếp hạng sẽ tự động xuất hiện.
 * 2. ĐỒNG BỘ URL QUERY PARAMETER (?game=):
 *    - Trò chơi đang chọn được đồng bộ 2 chiều với query parameter `?game=<gameId>`.
 *    - Giúp người dùng chia sẻ link bảng xếp hạng hoặc F5 giữ nguyên trò chơi đang xem.
 * 3. TIẾT KIỆM TÀI NGUYÊN & CACHE REFRESH:
 *    - Tận dụng bộ đệm in-memory 60s từ `leaderboardRepository`.
 *    - Tự động làm mới khi tab trình duyệt active trở lại (`visibilitychange`).
 * 4. CƠ CHẾ FAIL-SOFT KHI CHƯA CÓ MÙA GIẢI:
 *    - Nếu hệ thống chưa kích hoạt mùa giải nào (`activeSeason === null`), trang sẽ
 *      hiển thị thông báo nhẹ nhàng và ẩn danh sách thay vì văng lỗi.
 * ==============================================================================
 */

export function LeaderboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);

  // 1. LẤY DANH SÁCH GAME CÓ CHẾ ĐỘ XẾP HẠNG TỪ REGISTRY
  const rankedGames = useMemo(() => {
    return getAllGames()
      .filter((entry) => entry.definition.ranked)
      .map((entry) => entry.definition);
  }, []);

  // 2. XÁC ĐỊNH GAME ĐANG ĐƯỢC CHỌN TỪ URL QUERY HOẶC MẶC ĐỊNH LÀ GAME ĐẦU TIÊN
  const gameParam = searchParams.get('game');
  const selectedGameId = useMemo(() => {
    if (gameParam && rankedGames.some((g) => g.id === gameParam)) {
      return gameParam;
    }
    return rankedGames[0]?.id || '';
  }, [gameParam, rankedGames]);

  // 3. TRẠNG THÁI DỮ LIỆU
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<LeaderboardCursor | null>(null);
  const [myRank, setMyRank] = useState<MyLeaderboardRank | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 4. HÀM TẢI DỮ LIỆU TRANG ĐẦU TIÊN
  const loadInitialData = useCallback(
    async (isSilent = false) => {
      if (!selectedGameId) {
        setIsLoading(false);
        return;
      }

      if (!isSilent) {
        setIsLoading(true);
      }
      setError(null);

      try {
        // Lấy mùa giải đang active
        const season = await getActiveSeason();
        setActiveSeason(season);

        if (!season) {
          setIsLoading(false);
          return;
        }

        // Tải đồng thời bảng xếp hạng trang 1 và hạng cá nhân
        const [pageData, rankData] = await Promise.all([
          getLeaderboardPage(selectedGameId, season.id, null, 50, 1),
          getMyRank(selectedGameId, season.id),
        ]);

        setEntries([...pageData.entries]);
        setNextCursor(pageData.nextCursor);
        setMyRank(rankData);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Không thể tải dữ liệu bảng xếp hạng';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [selectedGameId],
  );

  // 5. EFFECT TẢI DỮ LIỆU KHI CHỌN GAME / USER THAY ĐỔI
  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData, user?.id]);

  // 6. EFFECT LẮNG NGHE VISIBILITYCHANGE ĐỂ TỰ ĐỘNG REFRESH
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadInitialData(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadInitialData]);

  // 7. XỬ LÝ CHUYỂN TAB TRÒ CHƠI
  const handleTabChange = (gameId: string) => {
    if (gameId === selectedGameId) return;
    setSearchParams({ game: gameId }, { replace: true });
  };

  // 8. XỬ LÝ TẢI THÊM TRANG TIẾP THEO (KEYSET PAGINATION)
  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore || !activeSeason || !selectedGameId) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const nextPage = await getLeaderboardPage(
        selectedGameId,
        activeSeason.id,
        nextCursor,
        50,
        entries.length + 1,
      );

      setEntries((prev) => [...prev, ...nextPage.entries]);
      setNextCursor(nextPage.nextCursor);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể tải thêm bảng xếp hạng';
      setError(message);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="relative flex flex-col w-full max-w-2xl mx-auto space-y-4 px-2 sm:px-4 pb-20">
      {/* 
        ========================================================================
        HEADER TRANG & BADGE MÙA GIẢI
        ========================================================================
      */}
      <section className="text-center space-y-2 pt-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 shadow-xs">
          <span>🏆</span>
          <span>{activeSeason ? activeSeason.name : 'Đang tải mùa giải...'}</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Bảng Xếp Hạng
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          Theo dõi thứ hạng Elo và điểm thưởng của các kỳ thủ hàng đầu trên toàn hệ thống.
        </p>
      </section>

      {/* 
        ========================================================================
        THANH TAB CHỌN GAME (REGISTRY-DRIVEN CHIP SCROLL)
        ========================================================================
      */}
      {rankedGames.length > 0 && (
        <div
          data-testid="ranked-games-tab-bar"
          className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-0.5 select-none"
        >
          {rankedGames.map((game) => {
            const isSelected = game.id === selectedGameId;
            return (
              <button
                key={game.id}
                type="button"
                data-testid={`game-tab-${game.id}`}
                onClick={() => handleTabChange(game.id)}
                className={`inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold shrink-0 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  isSelected
                    ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20'
                    : 'bg-surface dark:bg-surface-dark text-slate-700 dark:text-slate-200 border border-surface-border dark:border-surface-dark-border hover:bg-surface-muted dark:hover:bg-surface-dark-muted'
                }`}
              >
                <span className="text-base">{CATEGORY_CONFIGS[game.category]?.emoji || '🎮'}</span>
                <span>{game.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 
        ========================================================================
        KHỐI BÁO LỖI VÀ NÚT THỬ LẠI (OFFLINE-FIRST RESILIENCE)
        ========================================================================
      */}
      {error && (
        <div
          data-testid="leaderboard-error-banner"
          className="flex flex-col items-center justify-center p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-center gap-2"
        >
          <span className="text-xs sm:text-sm text-red-700 dark:text-red-300 font-medium">
            {error}
          </span>
          <button
            type="button"
            onClick={() => void loadInitialData()}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all focus:outline-none"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 
        ========================================================================
        CƠ CHẾ FAIL-SOFT KHI CHƯA CÓ MÙA GIẢI ACTIVE
        ========================================================================
      */}
      {!isLoading && !activeSeason && !error && (
        <div
          data-testid="no-active-season-notice"
          className="flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-surface-border dark:border-surface-dark-border bg-surface/60 dark:bg-surface-dark/60 space-y-2"
        >
          <span className="text-3xl">⏳</span>
          <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">
            Chưa có mùa giải đang diễn ra
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
            Bảng xếp hạng sẽ mở lại khi mùa giải mới bắt đầu.
          </p>
        </div>
      )}

      {/* 
        ========================================================================
        DANH SÁCH BẢNG XẾP HẠNG
        ========================================================================
      */}
      {(isLoading || activeSeason) && !error && (
        <LeaderboardList
          entries={entries}
          myUserId={user?.id || null}
          hasMore={nextCursor !== null}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
          isLoading={isLoading}
          emptyText="Chưa có kỳ thủ nào hoàn thành định hạng (10 trận) cho trò chơi này."
        />
      )}

      {/* 
        ========================================================================
        THANH GHIM HẠNG CÁ NHÂN (MY RANK FOOTER)
        ========================================================================
      */}
      {activeSeason && !isLoading && !error && (
        <MyRankFooter myRank={myRank} minMatches={MIN_MATCHES_FOR_LEADERBOARD} />
      )}
    </div>
  );
}

export default LeaderboardPage;
