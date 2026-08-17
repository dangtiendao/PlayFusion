import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllGames } from '@/games/registry';
import { GameCard } from '@/components/games/GameCard';
import { getCategoryConfig } from '@/games/labels';
import { removeVietnameseTones } from '@/core/text';
import type { GameCategory } from '@engines/types';

/**
 * ==============================================================================
 * TRANG CHỦ: SẢNH TRÒ CHƠI ĐỘNG (DYNAMIC GAME HUB HOME PAGE)
 * ==============================================================================
 *
 * GHI CHÚ KIẾN TRÚC:
 * 1. KHÔNG hard-code bất kỳ tên trò chơi hay danh sách nào trong UI.
 * 2. Toàn bộ danh mục game, thể loại và chế độ chơi đều được sinh động từ `src/games/registry.ts`.
 * 3. Hỗ trợ tìm kiếm tiếng Việt không dấu, bộ lọc danh mục cuộn ngang mượt mà, và responsive grid 2-4 cột.
 * ==============================================================================
 */

export function HomePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<GameCategory | 'all'>('all');

  // Lấy toàn bộ danh sách game từ Registry
  const allGames = useMemo(() => getAllGames(), []);

  // Trích xuất động các category thực sự có mặt trong Registry (không render category rỗng)
  const availableCategories = useMemo(() => {
    const categoriesSet = new Set<GameCategory>();
    for (const game of allGames) {
      categoriesSet.add(game.definition.category);
    }
    return Array.from(categoriesSet);
  }, [allGames]);

  // Bộ lọc kết hợp Tìm kiếm (có dấu/không dấu) + Thể loại (AND condition)
  const filteredGames = useMemo(() => {
    const normalizedQuery = removeVietnameseTones(searchQuery);

    return allGames.filter(({ definition }) => {
      // 1. Lọc theo thể loại
      if (selectedCategory !== 'all' && definition.category !== selectedCategory) {
        return false;
      }

      // 2. Lọc theo từ khóa tìm kiếm
      if (normalizedQuery.length > 0) {
        const normalizedName = removeVietnameseTones(definition.name);
        const normalizedDesc = removeVietnameseTones(definition.description);
        const normalizedId = removeVietnameseTones(definition.id);

        const isMatch =
          normalizedName.includes(normalizedQuery) ||
          normalizedDesc.includes(normalizedQuery) ||
          normalizedId.includes(normalizedQuery);

        if (!isMatch) return false;
      }

      return true;
    });
  }, [allGames, searchQuery, selectedCategory]);

  const handleGameCardClick = (gameId: string) => {
    navigate(`/game/${gameId}`);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
  };

  return (
    <div className="space-y-5 pb-6">
      {/* 1. THANH TÌM KIẾM TRÒ CHƠI */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm kiếm trò chơi (ví dụ: cờ, caro, giải đố...)"
          aria-label="Tìm kiếm trò chơi"
          className="w-full pl-10 pr-10 py-3 rounded-2xl border border-surface-border dark:border-surface-dark-border bg-surface dark:bg-surface-dark text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm transition-all"
        />
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Xóa từ khóa tìm kiếm"
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <span className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-xs">
              ✕
            </span>
          </button>
        )}
      </div>

      {/* 2. HÀNG CHIP LỌC THỂ LOẠI (CUỘN NGANG MOBILE) */}
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none"
        role="tablist"
        aria-label="Bộ lọc thể loại"
      >
        {/* Chip Tất cả */}
        <button
          type="button"
          role="tab"
          aria-selected={selectedCategory === 'all'}
          onClick={() => setSelectedCategory('all')}
          className={`flex-shrink-0 min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm ${
            selectedCategory === 'all'
              ? 'bg-primary-600 text-white shadow-primary-500/20'
              : 'bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border text-slate-700 dark:text-slate-300 hover:bg-surface-muted dark:hover:bg-surface-dark-muted'
          }`}
        >
          <span>✨ Tất cả ({allGames.length})</span>
        </button>

        {/* Các Chips Thể loại sinh động từ Registry */}
        {availableCategories.map((category) => {
          const config = getCategoryConfig(category);
          const isSelected = selectedCategory === category;
          const count = allGames.filter((g) => g.definition.category === category).length;

          return (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setSelectedCategory(category)}
              className={`flex-shrink-0 min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm ${
                isSelected
                  ? 'bg-primary-600 text-white shadow-primary-500/20'
                  : 'bg-surface dark:bg-surface-dark border border-surface-border dark:border-surface-dark-border text-slate-700 dark:text-slate-300 hover:bg-surface-muted dark:hover:bg-surface-dark-muted'
              }`}
            >
              <span>{config.emoji}</span>
              <span>{config.name}</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-surface-muted dark:bg-surface-dark-muted text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. LƯỚI DANH SÁCH GAME HOẶC EMPTY STATE */}
      {filteredGames.length > 0 ? (
        <section aria-label="Danh sách trò chơi">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filteredGames.map(({ definition }) => (
              <GameCard key={definition.id} definition={definition} onClick={handleGameCardClick} />
            ))}
          </div>
        </section>
      ) : (
        /* Empty State */
        <section
          aria-label="Không có kết quả"
          className="p-8 text-center bg-surface dark:bg-surface-dark rounded-2xl border border-surface-border dark:border-surface-dark-border space-y-3 shadow-sm"
        >
          <div className="text-4xl">🔍</div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Không tìm thấy trò chơi nào
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Không có trò chơi nào khớp với từ khóa "{searchQuery}" trong danh mục đã chọn.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearFilters}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/50 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
          >
            Xóa bộ lọc & Hiển thị tất cả
          </button>
        </section>
      )}
    </div>
  );
}

export default HomePage;
