import Link from "next/link";

export function AddBook() {
  return (
    <Link
      href="/new"
      className="book-add flex flex-col items-center justify-center rounded-r-[2px] rounded-l-[1px] text-white/70 hover:text-white"
      style={{ width: "120px", height: "172px" }}
      aria-label="새 책 추가"
    >
      <div className="text-4xl font-light leading-none mb-2">+</div>
      <div className="text-[10px] font-cormorant tracking-[0.3em] uppercase">
        Add Book
      </div>
    </Link>
  );
}
