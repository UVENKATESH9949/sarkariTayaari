import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { deleteBookmark, insertBookmark, loadBookmarks, type BookmarkedQuestion } from "../db/bookmarks";

export type { BookmarkedQuestion };

type BookmarksContextValue = {
  bookmarks: BookmarkedQuestion[];
  isBookmarked: (questionId: string) => boolean;
  toggleBookmark: (question: BookmarkedQuestion) => void;
};

const BookmarksContext = createContext<BookmarksContextValue>({
  bookmarks: [],
  isBookmarked: () => false,
  toggleBookmark: () => {},
});

export function useBookmarks() {
  return useContext(BookmarksContext);
}

/**
 * Backed by local SQLite (`bookmarks`), so bookmarks survive app restarts.
 * Same optimistic-update pattern as SessionHistoryProvider: state flips
 * immediately for a responsive star toggle, the SQLite write/delete happens
 * in the background.
 */
export function BookmarksProvider({ children }: { children: ReactNode }) {
  const [bookmarks, setBookmarks] = useState<BookmarkedQuestion[]>([]);

  useEffect(() => {
    loadBookmarks().then(setBookmarks);
  }, []);

  const isBookmarked = (questionId: string) => bookmarks.some((b) => b.questionId === questionId);

  const toggleBookmark = (question: BookmarkedQuestion) => {
    const alreadyBookmarked = bookmarks.some((b) => b.questionId === question.questionId);

    setBookmarks((prev) =>
      alreadyBookmarked ? prev.filter((b) => b.questionId !== question.questionId) : [question, ...prev],
    );

    const persist = alreadyBookmarked
      ? deleteBookmark(question.questionId)
      : insertBookmark(question);
    persist.catch((err) => console.warn("Failed to persist bookmark", err));
  };

  return (
    <BookmarksContext.Provider value={{ bookmarks, isBookmarked, toggleBookmark }}>
      {children}
    </BookmarksContext.Provider>
  );
}
