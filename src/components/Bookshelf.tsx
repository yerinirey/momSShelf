import type { Book as BookT } from "@/lib/types";
import { Book } from "./Book";
import { AddBook } from "./AddBook";

const BOOKS_PER_SHELF = 6;

export function Bookshelf({ books }: { books: BookT[] }) {
  // 추가 버튼은 항상 마지막 자리
  const items: Array<{ kind: "book"; book: BookT } | { kind: "add" }> = [
    ...books.map((b) => ({ kind: "book" as const, book: b })),
    { kind: "add" as const },
  ];

  // 선반 단위로 나누기
  const shelves: typeof items[] = [];
  for (let i = 0; i < items.length; i += BOOKS_PER_SHELF) {
    shelves.push(items.slice(i, i + BOOKS_PER_SHELF));
  }
  // 최소 3단 보장
  while (shelves.length < 3) shelves.push([]);

  return (
    <div className="shelf-back rounded-md p-4 sm:p-6 shadow-2xl">
      <div className="flex flex-col gap-0">
        {shelves.map((row, idx) => (
          <div key={idx} className="relative">
            {/* 책들 */}
            <div
              className="flex items-end justify-start gap-3 sm:gap-4 px-3 pt-6 pb-2 min-h-[190px] flex-wrap"
            >
              {row.map((item, i) =>
                item.kind === "book" ? (
                  <Book key={item.book.id} book={item.book} />
                ) : (
                  <AddBook key={`add-${idx}-${i}`} />
                ),
              )}
            </div>
            {/* 선반 바닥 */}
            <div className="shelf-ledge h-3 rounded-sm mx-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
