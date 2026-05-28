export type BookType = "novel" | "movie";

export type CoverConfig = {
  spineColor: string;
  accentColor: string;
  textColor: string;
  pattern: "plain" | "stripes" | "dots" | "diamond" | "wave";
};

export type Book = {
  id: string;
  title: string;
  author: string | null;
  type: BookType;
  year: number | null;
  html_path: string;
  cover_config: CoverConfig | null;
  summary: string | null;
  owner_id: string | null;
  created_at: string;
};
