export interface Article {
  id: string;
  title: string;
  date: string;
  image: string;
  excerpt: string;
  tag?: string;
  mode?: 'arena' | 'battlegrounds' | 'standard' | 'wild' | 'general' | string;
  url: string;
  likes?: number;
  dislikes?: number;
  userVote?: 'like' | 'dislike' | null;
}

export interface ArticlesData {
  articles: Article[];
  updatedAt: string | null;
}
